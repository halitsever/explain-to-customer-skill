#!/usr/bin/env node
/**
 * _source/diagrams/*.mmd -> diagrams/<name>.svg (transparent, fonts embedded), diagrams/<name>.png (scale 2, style
 * background) and _source/diagrams/<name>.scene.png (transparent, for video scenes and stills).
 *   render-diagrams.mjs --src <folder>/_source [--only name]
 * A Mermaid syntax error fails that diagram only; the JSON names the file and the parser message.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs, loadRun, readJson, exists, die, log, fmtBytes, importTool, findChromium } from "./lib/common.mjs";

const args = parseArgs();

async function main() {
  const run = loadRun(args.src);
  const src = run.src;
  const cfgPath = path.join(src, "mermaid-config.json");
  if (!exists(cfgPath)) die("No mermaid-config.json yet. Run theme.mjs first.");
  const config = readJson(cfgPath);
  const tokens = readJson(path.join(src, "tokens.json"), {});
  const cssUrl = pathToFileURL(path.join(src, "fonts", "mermaid.css"));
  const inDir = path.join(src, "diagrams");
  const outDir = path.join(run.folder, run.layout.diagrams);
  let files = exists(inDir)
    ? fs
        .readdirSync(inDir)
        .filter((f) => f.endsWith(".mmd"))
        .sort()
    : [];
  if (args.only) files = files.filter((f) => String(args.only).split(",").includes(path.basename(f, ".mmd")));
  if (!files.length) die(`No .mmd files in ${inDir}`);
  fs.mkdirSync(outDir, { recursive: true });

  const { run: mmdc } = await importTool("@mermaid-js/mermaid-cli");
  const { default: puppeteer } = await importTool("puppeteer");
  const chrome = findChromium();
  if (!chrome) die("No Chromium found. Run setup.mjs first.");
  const launch = { executablePath: chrome.path, headless: chrome.kind === "headless-shell" ? "shell" : true, args: process.getuid?.() === 0 ? ["--no-sandbox"] : [] };
  const browser = await puppeteer.launch(launch);
  const bg = tokens.colors?.background || "#FFFFFF";
  const sceneConfig = { ...config, themeVariables: { ...config.themeVariables, edgeLabelBackground: tokens.colors?.surface || bg } };
  const results = [];
  try {
    for (const f of files) {
      const name = path.basename(f, ".mmd");
      const input = path.join(inDir, f);
      const base = { mermaidConfig: config, customFontCSS: [{ cssUrl }], fontEmbed: true, viewport: { width: 1920, height: 1080, deviceScaleFactor: 2 } };
      const outs = [
        { file: path.join(outDir, `${name}.svg`), opts: { ...base, backgroundColor: "transparent" } },
        { file: path.join(outDir, `${name}.png`), opts: { ...base, backgroundColor: bg } },
        // Scenes place diagrams on a card, so edge labels take the card colour instead of the page colour.
        { file: path.join(inDir, `${name}.scene.png`), opts: { ...base, backgroundColor: "transparent", mermaidConfig: sceneConfig } },
      ];
      try {
        for (const o of outs) await mmdc(input, o.file, { browser, quiet: true, parseMMDOptions: o.opts });
        results.push({ name, ok: true, files: outs.map((o) => ({ file: o.file, size: fmtBytes(fs.statSync(o.file).size) })) });
        log(`✓ ${name}`);
      } catch (e) {
        const msg = String(e.message || e)
          .split("\n")
          .slice(0, 6)
          .join(" ");
        results.push({ name, ok: false, error: msg, source: input });
        log(`✗ ${name}: ${msg}`);
      }
    }
  } finally {
    await browser.close();
  }
  const failed = results.filter((r) => !r.ok);
  process.stdout.write(JSON.stringify({ ok: failed.length === 0, look: config.look, outDir, results }, null, 2) + "\n");
  if (failed.length) process.exit(1);
}

main().catch((e) => die(e.stack || e.message));
