/** Bake scenes in Chromium (fonts, text fitting, rough outlines) and optionally screenshot them. */
import fs from "node:fs";
import path from "node:path";
import { launchChromium } from "./common.mjs";
import { serveDir } from "./static-server.mjs";
import { sectionOf } from "./scenes.mjs";

/**
 * scenes: [{ file, path }]; shots: Map(file -> { out, scale }).
 * Writes the baked <section> back into each scene file, returns per-scene reports.
 */
export async function bakeScenes(src, scenes, shots = new Map()) {
  const server = await serveDir(src);
  const browser = await launchChromium();
  const reports = [];
  try {
    const scales = [...new Set([1, ...[...shots.values()].map((s) => s.scale || 2)])];
    const contexts = new Map();
    for (const scale of scales) contexts.set(scale, await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: scale }));
    for (const s of scenes) {
      const shot = shots.get(s.file);
      const ctx = contexts.get(shot?.scale || 1);
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("requestfailed", (r) => errors.push(`request failed: ${r.url().replace(server.url, "")}`));
      await page.goto(`${server.url}/scenes/${s.file}`, { waitUntil: "load" });
      const report = await page.evaluate(() => (window.__etcBake ? window.__etcBake() : { fonts: [], issues: [{ kind: "no-runtime" }] }));
      const section = await page.evaluate(() => document.querySelector("section.scene")?.outerHTML || null);
      if (section) {
        const html = fs.readFileSync(s.path, "utf8");
        if (sectionOf(html) !== null) {
          fs.writeFileSync(s.path, html.replace(/<!--scene:start-->[\s\S]*?<!--scene:end-->/, `<!--scene:start-->\n${section}\n<!--scene:end-->`));
        }
      }
      if (shot) {
        fs.mkdirSync(path.dirname(shot.out), { recursive: true });
        await page.screenshot({ path: shot.out, clip: { x: 0, y: 0, width: 1920, height: 1080 } });
      }
      reports.push({ file: s.file, ...report, errors, output: shot?.out || null });
      await page.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }
  return reports;
}

/** Default still selection: summary card first, then up to four content scenes (no title or outro). */
export function pickStills(sb, scenes) {
  const wanted = sb.meta?.images;
  let list;
  if (Array.isArray(wanted) && wanted.length) {
    list = wanted.map((id) => scenes.find((s) => s.scene.id === id)).filter(Boolean);
  } else {
    const summary = scenes.filter((s) => s.scene.type === "summary-card");
    const content = scenes.filter((s) => !["summary-card", "title", "outro"].includes(s.scene.type));
    list = [...summary, ...content].slice(0, 5);
  }
  return list.map((s, i) => ({ ...s, still: `${String(i + 1).padStart(2, "0")}-${s.scene.type === "summary-card" ? "summary" : s.scene.id}.png` }));
}
