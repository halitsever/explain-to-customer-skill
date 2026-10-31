#!/usr/bin/env node
/**
 * Scene HTML -> PNG stills at 1920x1080, deviceScaleFactor 2.
 *   render-stills.mjs --src <folder>/_source [--only summary,after] [--scale 2] [--force]
 * Bakes every scene (fonts, text fit, rough outlines) so the video reuses exactly what the stills show.
 */
import fs from "node:fs";
import path from "node:path";
import { parseArgs, loadRun, exists, die, log, fmtBytes } from "./lib/common.mjs";
import { buildScenes } from "./lib/scenes.mjs";
import { bakeScenes, pickStills } from "./lib/stills.mjs";

const args = parseArgs();

async function main() {
  const run = loadRun(args.src);
  if (!exists(path.join(run.src, "tokens.css"))) die("No tokens.css yet. Run theme.mjs --style <id> --src <_source> first.");
  const { sb, scenes, warnings: buildWarnings } = buildScenes(run.src, { force: !!args.force });
  let stills = pickStills(sb, scenes);
  if (args.only) {
    const only = String(args.only)
      .split(",")
      .map((s) => s.trim());
    stills = stills.filter((s) => only.includes(s.scene.id) || (only.includes("summary") && s.scene.type === "summary-card"));
  }
  const imagesDir = path.join(run.folder, run.layout.images);
  const scale = Number(args.scale || 2);
  const shots = new Map(stills.map((s) => [s.file, { out: path.join(imagesDir, s.still), scale }]));
  // A full re-render replaces the numbered set, so stale slides from an older storyboard do not linger.
  if (!args.only && exists(imagesDir)) {
    for (const f of fs.readdirSync(imagesDir)) if (/^\d{2}-.+\.png$/.test(f)) fs.rmSync(path.join(imagesDir, f));
  }
  log(`Baking ${scenes.length} scene(s), rendering ${stills.length} still(s) at ${1920 * scale}x${1080 * scale} …`);
  const reports = await bakeScenes(run.src, scenes, shots);

  const issues = [...buildWarnings];
  for (const r of reports) {
    for (const f of r.fonts || []) if (!f.loaded) issues.push({ scene: r.file, kind: "font-fallback", detail: `${f.role} font "${f.family}" did not load` });
    for (const i of r.issues || []) issues.push({ scene: r.file, ...i });
    for (const e of r.errors || []) issues.push({ scene: r.file, kind: "page-error", detail: e });
  }
  const files = stills.map((s) => {
    const p = shots.get(s.file).out;
    return { file: p, scene: s.scene.id, size: exists(p) ? fmtBytes(fs.statSync(p).size) : null };
  });
  const out = { ok: issues.length === 0, imagesDir, files, issues, fonts: reports[0]?.fonts || [] };
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
}

main().catch((e) => die(e.stack || e.message));
