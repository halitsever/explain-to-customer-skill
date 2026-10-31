#!/usr/bin/env node
/**
 * Baked scenes -> HyperFrames composition -> MP4 (1920x1080, 30 fps, H.264, yuv420p, faststart, no audio),
 * plus a poster PNG (title scene) and a GIF preview.
 *   render-video.mjs --src <folder>/_source [--engine auto|hyperframes|playwright] [--no-gif] [--estimate] [--force]
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { parseArgs, loadRun, exists, die, log, fmtBytes, readJson, WS, SKILL_DIR, renderEnv, runStream, runSync, findFfmpeg, launchChromium } from "./lib/common.mjs";
import { buildScenes, timeline, sectionOf } from "./lib/scenes.mjs";
import { bakeScenes } from "./lib/stills.mjs";
import { serveDir } from "./lib/static-server.mjs";

const args = parseArgs();
const FPS = 30;
const MAX_MB = 25;
const GIF_MAX_MB = 10;

const nodeMajor = Number(process.versions.node.split(".")[0]);
const hfBin = path.join(WS, "node_modules", "hyperframes", "bin", "hyperframes.mjs");

/** Wall-clock estimate in seconds. Measured: 22.5 s of video in 15 s on Apple Silicon; slower machines take up to 2x. */
const estimate = (total, engine) => Math.round(engine === "hyperframes" ? 10 + total * 0.6 : 10 + total * 3);

function copyDir(from, to, filter = () => true) {
  if (!exists(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name);
    const b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b, filter);
    else if (filter(e.name)) fs.copyFileSync(a, b);
  }
}

function buildComposition(src, sb, tl) {
  const dir = path.join(src, "video");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  copyDir(path.join(src, "fonts"), path.join(dir, "fonts"));
  copyDir(path.join(src, "lib"), path.join(dir, "lib"));
  copyDir(path.join(src, "assets"), path.join(dir, "assets"));
  copyDir(path.join(src, "brand"), path.join(dir, "brand"));
  copyDir(path.join(src, "diagrams"), path.join(dir, "diagrams"), (n) => /\.(png|svg|jpe?g|webp)$/i.test(n));
  fs.copyFileSync(path.join(src, "tokens.css"), path.join(dir, "tokens.css"));
  const clips = [];
  const spec = { scenes: [], total: tl.total };
  tl.list.forEach((s, i) => {
    const section = sectionOf(fs.readFileSync(s.path, "utf8"));
    if (!section) throw new Error(`Scene ${s.file} lost its <!--scene:start--> markers`);
    const id = `clip-${i + 1}`;
    const html = section.replace(/(src|href)="\.\.\//g, '$1="');
    clips.push(`<div class="clip" id="${id}" data-start="${s.start}" data-duration="${s.duration}" data-track-index="0">\n${html}\n</div>`);
    spec.scenes.push({ id, start: s.start, duration: s.duration, transition: s.scene.transition || "fade" });
  });
  const tpl = fs.readFileSync(path.join(SKILL_DIR, "templates", "scenes", "_composition.html"), "utf8");
  const out = tpl
    .replace("{{lang}}", sb.meta?.lang || "en")
    .replace("{{title}}", String(sb.meta?.title || "Explainer").replace(/</g, "&lt;"))
    .replace("{{total}}", String(tl.total))
    .replace("{{clips}}", clips.join("\n"))
    .replace("{{spec}}", JSON.stringify(spec));
  fs.writeFileSync(path.join(dir, "index.html"), out);
  return dir;
}

function probe(file) {
  const ff = findFfmpeg();
  if (!ff.ffprobe) return null;
  const r = runSync(ff.ffprobe, ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file], { timeout: 20000 });
  if (r.code !== 0) return null;
  const j = JSON.parse(r.stdout);
  const v = j.streams.find((s) => s.codec_type === "video");
  const [n, d] = String(v?.r_frame_rate || "0/1")
    .split("/")
    .map(Number);
  return {
    codec: v?.codec_name,
    pixFmt: v?.pix_fmt,
    width: v?.width,
    height: v?.height,
    fps: d ? n / d : 0,
    duration: Number(j.format.duration),
    size: Number(j.format.size),
    audio: j.streams.some((s) => s.codec_type === "audio"),
  };
}

async function ffmpeg(argv, label) {
  const ff = findFfmpeg();
  const r = await runStream(ff.ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...argv], { quiet: true });
  if (r.code !== 0) throw new Error(`ffmpeg ${label} failed: ${r.stderr.slice(-600)}`);
}

async function renderHyperframes(dir, tmp) {
  if (!exists(hfBin)) throw new Error("hyperframes is not installed in the tool workspace");
  const env = renderEnv();
  const r = await runStream(process.execPath, [hfBin, "render", dir, "-o", tmp, "--fps", String(FPS), "--quality", "standard", "--crf", "20", "--quiet"], {
    env,
    cwd: dir,
    prefix: "  hyperframes: ",
    quiet: !args.verbose,
  });
  if (r.code !== 0 || !exists(tmp)) throw new Error(`hyperframes render failed (exit ${r.code}): ${(r.stderr || r.stdout).split("\n").filter(Boolean).slice(-6).join(" | ")}`);
}

/** Deterministic fallback: seek the paused timeline frame by frame and pipe screenshots to FFmpeg. */
async function renderPlaywright(dir, tmp, total) {
  const ff = findFfmpeg();
  if (!ff.ffmpeg) throw new Error("FFmpeg not found");
  const server = await serveDir(dir);
  const browser = await launchChromium();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto(`${server.url}/index.html`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => window.__etc && typeof window.__etc.seek === "function");
  const enc = spawn(
    ff.ffmpeg,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "image2pipe",
      "-framerate",
      String(FPS),
      "-c:v",
      "mjpeg",
      "-i",
      "-",
      "-vf",
      "scale=in_range=pc:out_range=tv,format=yuv420p",
      "-color_range",
      "tv",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-r",
      String(FPS),
      "-an",
      "-movflags",
      "+faststart",
      tmp,
    ],
    { stdio: ["pipe", "ignore", "pipe"] },
  );
  let err = "";
  enc.stderr.on("data", (b) => {
    err += b;
  });
  const done = new Promise((resolve) => enc.on("close", resolve));
  const frames = Math.round(total * FPS);
  for (let f = 0; f < frames; f++) {
    await page.evaluate((t) => window.__etc.seek(t), f / FPS);
    const buf = await page.screenshot({ type: "jpeg", quality: 92 });
    if (!enc.stdin.write(buf)) await new Promise((r) => enc.stdin.once("drain", r));
    if (f % (FPS * 5) === 0) log(`  frame ${f}/${frames}`);
  }
  enc.stdin.end();
  const code = await done;
  await browser.close();
  await server.close();
  if (code !== 0) throw new Error(`ffmpeg encode failed: ${err.slice(-400)}`);
}

async function finalize(tmp, out) {
  let p = probe(tmp);
  if (!p) throw new Error("ffprobe could not read the render");
  const compliant = p.codec === "h264" && p.pixFmt === "yuv420p" && p.width === 1920 && p.height === 1080 && Math.abs(p.fps - FPS) < 0.01;
  if (compliant) {
    await ffmpeg(["-i", tmp, "-map", "0:v:0", "-c", "copy", "-an", "-movflags", "+faststart", out], "remux");
  } else {
    log(`  transcoding (${p.codec} ${p.pixFmt} ${p.width}x${p.height} ${p.fps}fps does not match the target)`);
    await ffmpeg(
      [
        "-i",
        tmp,
        "-map",
        "0:v:0",
        "-vf",
        "scale=1920:1080:flags=lanczos:out_range=tv,format=yuv420p",
        "-color_range",
        "tv",
        "-r",
        String(FPS),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-an",
        "-movflags",
        "+faststart",
        out,
      ],
      "transcode",
    );
  }
  for (const crf of [24, 28]) {
    p = probe(out);
    if (p.size <= MAX_MB * 1024 * 1024) break;
    log(`  ${fmtBytes(p.size)} is over ${MAX_MB} MB, re-encoding at CRF ${crf}`);
    await ffmpeg(
      ["-i", tmp, "-map", "0:v:0", "-c:v", "libx264", "-preset", "veryfast", "-crf", String(crf), "-pix_fmt", "yuv420p", "-r", String(FPS), "-an", "-movflags", "+faststart", out],
      "shrink",
    );
  }
  return probe(out);
}

async function makeGif(mp4, gif, duration) {
  const tries = [
    { fps: 12, w: 960, t: null },
    { fps: 10, w: 800, t: null },
    { fps: 10, w: 800, t: Math.min(15, duration) },
  ];
  for (const tr of tries) {
    const vf = `fps=${tr.fps},scale=${tr.w}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`;
    await ffmpeg([...(tr.t ? ["-t", String(tr.t)] : []), "-i", mp4, "-vf", vf, "-loop", "0", gif], "gif");
    const size = fs.statSync(gif).size;
    if (size <= GIF_MAX_MB * 1024 * 1024) return { path: gif, size: fmtBytes(size), fps: tr.fps, width: tr.w, trimmedTo: tr.t };
  }
  fs.rmSync(gif, { force: true });
  return { skipped: true, reason: `GIF stayed above ${GIF_MAX_MB} MB even at 10 fps, 800 px, 15 s` };
}

async function main() {
  const run = loadRun(args.src);
  if (!exists(path.join(run.src, "tokens.css"))) die("No tokens.css yet. Run theme.mjs first.");
  const { sb, scenes, warnings: buildWarnings } = buildScenes(run.src, { force: !!args.force });
  const tl = timeline(scenes);
  if (tl.total < 1) die("Storyboard has no video scenes.");
  let engine = args.engine && args.engine !== "auto" ? args.engine : nodeMajor >= 22 && exists(hfBin) ? "hyperframes" : "playwright";
  if (args.estimate) {
    process.stdout.write(JSON.stringify({ durationS: tl.total, scenes: tl.list.length, engine, estimateS: estimate(tl.total, engine) }) + "\n");
    return;
  }
  const ff = findFfmpeg();
  if (!ff.ffmpeg || !ff.ffprobe) die("FFmpeg/ffprobe not found. Install it (see preflight tools.ffmpeg.install) or run setup.mjs --ffmpeg-static.");

  const posterPath = path.join(run.folder, run.layout.poster);
  const titleScene = tl.list.find((s) => s.scene.type === "title") || tl.list[0];
  log(`Baking scenes …`);
  const reports = await bakeScenes(run.src, scenes, new Map([[titleScene.file, { out: posterPath, scale: 1 }]]));
  const issues = [
    ...buildWarnings,
    ...reports.flatMap((r) => [
      ...(r.fonts || []).filter((f) => !f.loaded).map((f) => ({ scene: r.file, kind: "font-fallback", detail: f.family })),
      ...(r.issues || []).map((i) => ({ scene: r.file, ...i })),
      ...(r.errors || []).map((e) => ({ scene: r.file, kind: "page-error", detail: e })),
    ]),
  ];

  const dir = buildComposition(run.src, sb, tl);
  const tmp = path.join(dir, "render.mp4");
  const out = path.join(run.folder, run.layout.video);
  log(`Rendering ${tl.total}s with ${engine} (about ${estimate(tl.total, engine)} s) …`);
  const started = Date.now();
  const warnings = [];
  try {
    if (engine === "hyperframes") await renderHyperframes(dir, tmp);
    else await renderPlaywright(dir, tmp, tl.total);
  } catch (e) {
    if (engine !== "hyperframes") throw e;
    warnings.push(`HyperFrames failed, used the Playwright fallback: ${e.message}`);
    log(`! ${e.message}\n  falling back to Playwright frame capture`);
    engine = "playwright";
    await renderPlaywright(dir, tmp, tl.total);
  }
  const p = await finalize(tmp, out);
  fs.rmSync(tmp, { force: true });
  let gif = { skipped: true, reason: "disabled with --no-gif" };
  if (args.gif !== false) gif = await makeGif(out, path.join(run.folder, run.layout.gif), p.duration);

  const result = {
    ok: true,
    engine,
    renderSeconds: Math.round((Date.now() - started) / 1000),
    video: {
      path: out,
      duration: +p.duration.toFixed(2),
      resolution: `${p.width}x${p.height}`,
      fps: p.fps,
      codec: p.codec,
      pixFmt: p.pixFmt,
      audio: p.audio,
      size: fmtBytes(p.size),
      underLimit: p.size <= MAX_MB * 1024 * 1024,
    },
    poster: exists(posterPath) ? posterPath : null,
    gif,
    composition: path.join(dir, "index.html"),
    issues,
    warnings,
  };
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

main().catch((e) => die(e.stack || e.message));
