#!/usr/bin/env node
/**
 * Contact sheet of every catalog style: swatches, sample heading and body text, and a mini Mermaid flow
 * rendered with that style's own config. Writes styles-preview.png in the skill folder (or --out).
 *   styles-preview.mjs [--out file.png] [--lang tr]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs, SKILL_DIR, readJson, writeJson, die, log, runSync, importTool, findChromium, launchChromium, escapeHtml } from "./lib/common.mjs";
import { serveDir } from "./lib/static-server.mjs";

const args = parseArgs();
const OUT = path.resolve(args.out || path.join(SKILL_DIR, "styles-preview.png"));
const FAMILY_ORDER = ["Modern SaaS", "Clean & friendly", "Bold & creative", "Extended"];
const ORDER = [
  "shadcn",
  "vercel",
  "linear",
  "stripe",
  "apple",
  "notion",
  "material",
  "fluent",
  "neo-brutalism",
  "glass",
  "whiteboard",
  "terminal",
  "carbon",
  "primer",
  "blueprint",
  "swiss",
  "nord",
  "catppuccin",
  "dracula",
  "clay",
  "executive",
];

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "etc-preview-"));
  const styles = fs
    .readdirSync(path.join(SKILL_DIR, "styles"))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => readJson(path.join(SKILL_DIR, "styles", f)))
    .sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
  const { run: mmdc } = await importTool("@mermaid-js/mermaid-cli");
  const { default: puppeteer } = await importTool("puppeteer");
  const chrome = findChromium();
  const pBrowser = await puppeteer.launch({ executablePath: chrome.path, headless: chrome.kind === "headless-shell" ? "shell" : true });
  try {
    for (const s of styles) {
      const src = path.join(tmp, s.id, "_source");
      fs.mkdirSync(src, { recursive: true });
      writeJson(path.join(src, "run.json"), { lang: args.lang || "tr" });
      const r = runSync(process.execPath, [path.join(SKILL_DIR, "scripts", "theme.mjs"), "--style", s.id, "--src", src, "--lang", args.lang || "tr"], { timeout: 60000 });
      if (r.code !== 0) die(`theme failed for ${s.id}: ${r.stderr}`);
      const tokens = readJson(path.join(src, "tokens.json"));
      const mmd = path.join(src, "mini.mmd");
      fs.writeFileSync(mmd, "flowchart LR\n  A[Önce] --> B[Güncelleme] --> C[Şimdi]\n");
      const cfg = readJson(path.join(src, "mermaid-config.json"));
      await mmdc(mmd, path.join(src, "mini.png"), {
        browser: pBrowser,
        quiet: true,
        parseMMDOptions: {
          mermaidConfig: cfg,
          backgroundColor: "transparent",
          customFontCSS: [{ cssUrl: new URL(`file://${path.join(src, "fonts", "mermaid.css")}`) }],
          viewport: { width: 900, height: 300, deviceScaleFactor: 2 },
        },
      });
      const c = tokens.colors;
      const sw = [
        c.background,
        c.surface,
        c.foreground,
        c.mutedForeground,
        c.primary,
        c.accent,
        c.success,
        c.warning,
        c.danger,
        ...(c.palette || []).slice(0, 3).map((p) => p.hex),
      ];
      fs.writeFileSync(
        path.join(src, "card.html"),
        `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="fonts/fonts.css"><link rel="stylesheet" href="/templates/scenes/base.css"><link rel="stylesheet" href="tokens.css">
<style>html,body{width:600px;height:400px}.stage{width:600px;height:400px}.c{position:relative;z-index:2;padding:26px 30px;display:flex;flex-direction:column;gap:12px;height:100%}
.top{display:flex;justify-content:space-between;align-items:baseline}.nm{font-family:var(--font-heading);font-weight:var(--heading-weight);letter-spacing:var(--heading-tracking);font-size:30px;color:var(--fg)}
.fam{font-size:14px;color:var(--muted-fg);font-weight:600}.sw{display:flex;gap:6px}.sw span{width:26px;height:26px;border-radius:50%;border:1px solid var(--border-solid)}
.h{font-family:var(--font-heading);font-weight:var(--heading-weight);letter-spacing:var(--heading-tracking);text-transform:var(--heading-case);font-size:24px;color:var(--fg)}
.b{font-size:16px;color:var(--muted-fg);line-height:1.35}.b strong{color:var(--fg)}.flow{margin-top:auto;height:96px;display:flex;align-items:center}.flow img{max-height:96px;max-width:540px}
.meta{position:absolute;right:30px;bottom:18px;font-family:var(--font-mono);font-size:12px;color:var(--muted-fg)}</style></head>
<body><div class="stage"><div class="c"><div class="top"><span class="nm">${escapeHtml(s.name)}</span><span class="fam">${escapeHtml(s.family)} · ${s.id}</span></div>
<div class="sw">${sw.map((x) => `<span style="background:${x}"></span>`).join("")}</div>
<div class="h">Kayıt formu artık daha net</div><div class="b"><strong>${escapeHtml(tokens.fonts.heading)}</strong> / ${escapeHtml(tokens.fonts.body)} · İıĞğŞşÇçÖöÜü 0123<br>${escapeHtml(s.description)}</div>
<div class="flow"><img src="mini.png"></div></div><div class="meta">radius ${s.radius} · ${tokens.mode} · ${tokens.mermaidLook}</div></div></body></html>`,
      );
      log(`✓ ${s.id}`);
    }
  } finally {
    await pBrowser.close();
  }
  const cols = 4;
  const page = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;padding:40px;background:#E9EAEC;font:600 28px system-ui,sans-serif;color:#1F2328;width:${cols * 620 - 20}px}
h1{margin:0 0 6px;font-size:34px}p{margin:0 0 28px;font-size:18px;font-weight:400;color:#4B5563}.g{display:grid;grid-template-columns:repeat(${cols},600px);gap:20px}
iframe{width:600px;height:400px;border:0;border-radius:14px;box-shadow:0 1px 2px rgba(0,0,0,.08),0 8px 24px -12px rgba(0,0,0,.25);background:#fff}.fh{grid-column:1/-1;font-size:22px;margin-top:14px}</style></head><body>
<h1>explain-to-customer · styles</h1><p>Pick by id with style=&lt;id&gt;. "Match my project" builds a style from your repo; Other also accepts brand hex colours or a website URL.</p><div class="g">
${FAMILY_ORDER.map(
  (fam) =>
    `<div class="fh">${escapeHtml(fam)}</div>${styles
      .filter((s) => s.family === fam)
      .map((s) => `<iframe src="/${s.id}/_source/card.html"></iframe>`)
      .join("")}`,
).join("")}
</div></body></html>`;
  fs.writeFileSync(path.join(tmp, "index.html"), page);
  fs.symlinkSync(path.join(SKILL_DIR, "templates"), path.join(tmp, "templates"));
  const server = await serveDir(tmp);
  const browser = await launchChromium();
  try {
    const p = await browser.newPage({ viewport: { width: cols * 620 + 60, height: 1000 }, deviceScaleFactor: 1 });
    await p.goto(`${server.url}/index.html`, { waitUntil: "load" });
    for (const f of p.frames()) await f.evaluate(() => document.fonts.ready).catch(() => {});
    await p.waitForTimeout(400);
    await p.screenshot({ path: OUT, fullPage: true });
  } finally {
    await browser.close();
    await server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  process.stdout.write(JSON.stringify({ ok: true, file: OUT, styles: styles.length }) + "\n");
}

main().catch((e) => die(e.stack || e.message));
