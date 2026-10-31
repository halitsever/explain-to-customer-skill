#!/usr/bin/env node
/**
 * QA for one run: ffprobe checks, frame extraction, blank-frame detection, on-screen text lint (privacy, jargon,
 * pacing, placeholders), contrast table, and a glyph card per font. Writes _source/qa/report.json.
 *   qa.mjs --src <folder>/_source
 * Then Read every file listed under "review".
 */
import fs from "node:fs";
import path from "node:path";
import { parseArgs, loadRun, readJson, writeJson, exists, die, fmtBytes, runSync, findFfmpeg, launchChromium } from "./lib/common.mjs";
import { timeline, sceneFileName } from "./lib/scenes.mjs";
import { serveDir } from "./lib/static-server.mjs";

const args = parseArgs();
const errors = [];
const warnings = [];
const err = (where, msg) => errors.push({ where, msg });
const warn = (where, msg) => warnings.push({ where, msg });

const SECRET = [
  [/AKIA[0-9A-Z]{16}/, "AWS access key"],
  [/\bsk-[A-Za-z0-9_-]{20,}/, "API secret key"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/, "GitHub token"],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/, "Slack token"],
  [/AIza[0-9A-Za-z_-]{35}/, "Google API key"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY/, "private key"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, "JWT"],
];
const INTERNAL_URL =
  /\b(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|[\w.-]+\.(?:local|internal|intranet|corp|lan))(?::\d+)?\b/i;
const URL_RE = /\bhttps?:\/\/\S+/i;
const EMAIL = /[\w.+-]+@([\w-]+\.)+[a-z]{2,}/i;
const SAFE_EMAIL = /@(example\.(com|org|net)|test\.(com|local)|demo\.)/i;
const PHONE = /(?:\+\d{1,3}[\s-]?)?(?:\(?\d{3}\)?[\s-]?)\d{3}[\s-]?\d{2}[\s-]?\d{2}\b/;
const PLACEHOLDER = /\{\{|\}\}|\bTODO\b|\bTBD\b|\bFIXME\b|lorem ipsum|\bXXX\b|\[[^\]]{2,40}\]/i;
const JARGON = [
  [/\b[\w-]+\.(tsx?|jsx?|mjs|py|rb|go|rs|java|kt|php|css|scss|json|ya?ml|sql|env)\b/i, "file name"],
  [/\b[a-z]+[A-Z][A-Za-z]+\b/, "camelCase identifier"],
  [/\b[a-z]+_[a-z_]+\b/, "snake_case identifier"],
  [/\w+\(\)/, "function call"],
  [/\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/, "commit hash"],
  [/\b(endpoint|refactor|commit|merge|pull request|backend|frontend|regex|middleware|webhook|cron|null|undefined|npm|repo)\b/i, "technical term"],
];

function lintText(where, text, { onScreen, technical }) {
  const s = String(text ?? "");
  if (!s.trim()) return;
  for (const [re, name] of SECRET) if (re.test(s)) err(where, `possible ${name}: "${s.slice(0, 60)}"`);
  // A credential value has digits or symbols, or is long; "Password: Password must be…" is product copy.
  const cred = s.match(/\b(password|passwd|secret|api[_-]?key|token)\s*[:=]\s*["']?([^\s"']{6,})/i);
  if (cred && (/[\d_\-+/=$!@#%]/.test(cred[2]) || cred[2].length >= 16)) err(where, `possible credential assignment: "${s.slice(0, 60)}"`);
  if (INTERNAL_URL.test(s)) err(where, `internal host or URL on ${onScreen ? "screen" : "page"}: "${s.match(INTERNAL_URL)[0]}"`);
  else if (URL_RE.test(s) && onScreen) warn(where, `URL on screen, check it is public: ${s.match(URL_RE)[0]}`);
  const em = s.match(EMAIL);
  if (em && !SAFE_EMAIL.test(em[0])) err(where, `email address "${em[0]}" (use demo data)`);
  if (onScreen && PHONE.test(s)) warn(where, `looks like a phone number: "${s.match(PHONE)[0]}"`);
  if (onScreen && PLACEHOLDER.test(s)) err(where, `placeholder left: "${s.match(PLACEHOLDER)[0]}"`);
  if (onScreen && !technical)
    for (const [re, name] of JARGON) if (re.test(s.replace(/\*\*/g, ""))) warn(where, `${name} on screen for a non-technical audience: "${s.match(re)[0]}"`);
}

const words = (s) => String(s).replace(/\*\*/g, "").split(/\s+/).filter(Boolean).length;

function lintStoryboard(sb) {
  const technical = sb.meta?.audience === "technical";
  const scenes = sb.scenes || [];
  scenes.forEach((sc, i) => {
    const where = `scene ${i + 1} (${sc.id})`;
    const texts = [
      ...(sc.onScreenText || []),
      ...Object.values(sc.data || {}).flatMap((v) => (typeof v === "string" ? [v] : v && typeof v === "object" ? Object.values(v).filter((x) => typeof x === "string") : [])),
    ];
    for (const t of texts) lintText(where, t, { onScreen: true, technical });
    for (const t of sc.onScreenText || []) {
      const n = words(t);
      if (n > 18) err(where, `line has ${n} words (max 12 for captions): "${t.slice(0, 50)}…"`);
      else if (n > 12) warn(where, `line has ${n} words (aim for ≤ 12): "${t.slice(0, 50)}…"`);
    }
    if (sc.type === "summary-card") return;
    const d = Number(sc.durationS) || 0;
    if (d < 2.5) err(where, `${d}s on screen; every caption needs at least 2.5 s`);
    const need = texts.reduce((a, t) => a + words(t), 0) / 3 + 0.8;
    if (d < need) warn(where, `${words(texts.join(" "))} words need about ${need.toFixed(1)} s to read at 3 words/s; scene is ${d} s`);
  });
  const video = scenes.filter((s) => s.type !== "summary-card");
  const total = video.reduce((a, s) => a + (Number(s.durationS) || 0), 0);
  if (sb.meta?.format && /video|all/.test(sb.meta.format)) {
    if (total > 90) err("storyboard", `video is ${total} s; hard limit is 90 s`);
    else if (total > 60 || total < 15) warn("storyboard", `video is ${total} s; target 30 to 60 s`);
    if (video.length < 4 || video.length > 7) warn("storyboard", `${video.length} video scenes; target 4 to 7`);
  }
  for (const [k, v] of Object.entries(sb.brief || {})) for (const t of [].concat(v)) lintText(`brief.${k}`, t, { onScreen: false, technical });
}

function probe(file) {
  const ff = findFfmpeg();
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
    fps: d ? +(n / d).toFixed(3) : 0,
    duration: Number(j.format?.duration || 0),
    size: Number(j.format?.size || fs.statSync(file).size),
    audio: j.streams.some((s) => s.codec_type === "audio"),
  };
}

/** True when the moov atom precedes mdat, i.e. the MP4 can start playing before it is fully downloaded. */
function faststart(file) {
  const fd = fs.openSync(file, "r");
  const size = fs.fstatSync(fd).size;
  const head = Buffer.alloc(8);
  let off = 0;
  try {
    while (off + 8 <= size) {
      fs.readSync(fd, head, 0, 8, off);
      let len = head.readUInt32BE(0);
      const type = head.toString("latin1", 4, 8);
      if (type === "moov") return true;
      if (type === "mdat") return false;
      if (len === 1) {
        const big = Buffer.alloc(8);
        fs.readSync(fd, big, 0, 8, off + 8);
        len = Number(big.readBigUInt64BE(0));
      }
      if (len < 8) return false;
      off += len;
    }
  } finally {
    fs.closeSync(fd);
  }
  return false;
}

function frameStats(png) {
  const ff = findFfmpeg();
  const r = runSync(ff.ffmpeg, ["-hide_banner", "-i", png, "-vf", "signalstats,metadata=print", "-f", "null", "-"], { timeout: 20000 });
  const txt = r.stderr + r.stdout;
  const get = (k) => Number((txt.match(new RegExp(`lavfi\\.signalstats\\.${k}=([\\d.]+)`)) || [])[1]);
  return { ymin: get("YMIN"), ymax: get("YMAX"), yavg: get("YAVG") };
}

function contactSheet(files, out, cols = 3, w = 640) {
  if (!files.length) return null;
  const ff = findFfmpeg();
  const h = Math.round((w * 9) / 16);
  const inputs = files.flatMap((f) => ["-i", f]);
  const n = files.length;
  if (n === 1) {
    runSync(ff.ffmpeg, ["-v", "error", "-y", ...inputs, "-vf", `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:gray`, out], {
      timeout: 60000,
    });
    return out;
  }
  const scale = files.map((_, i) => `[${i}]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:gray[s${i}]`).join(";");
  const layout = files.map((_, i) => `${(i % cols) * w}_${Math.floor(i / cols) * h}`).join("|");
  const filter = `${scale};${files.map((_, i) => `[s${i}]`).join("")}xstack=inputs=${n}:layout=${layout}:fill=gray[o]`;
  const r = runSync(ff.ffmpeg, ["-v", "error", "-y", ...inputs, "-filter_complex", filter, "-map", "[o]", out], { timeout: 120000 });
  return r.code === 0 ? out : null;
}

async function glyphCard(src, tokens, out) {
  const fams = [...new Set([tokens.fonts?.heading, tokens.fonts?.body, tokens.fonts?.mono, tokens.fonts?.mermaid].filter(Boolean))];
  const sample = "İıĞğŞşÇçÖöÜü Aa 0123 “quotes” – …";
  const html = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="../fonts/fonts.css"><link rel="stylesheet" href="../tokens.css">
<style>body{margin:0;width:1600px;padding:40px;background:var(--bg);color:var(--fg);font:20px system-ui}.row{display:flex;gap:24px;align-items:baseline;padding:14px 0;border-bottom:1px solid var(--border-solid)}.n{width:300px;color:var(--muted-fg)}.s{font-size:56px}.ok{color:green}.bad{color:red}</style>
${fams.map((f) => `<div class="row"><div class="n">${f}</div><div class="s" style="font-family:'${f}', serif;font-weight:400">${sample}</div></div><div class="row"><div class="n">${f} bold</div><div class="s" style="font-family:'${f}', serif;font-weight:700">${sample}</div></div>`).join("")}`;
  const qaDir = path.dirname(out);
  fs.writeFileSync(path.join(qaDir, "glyphs.html"), html);
  const server = await serveDir(src);
  const browser = await launchChromium();
  try {
    const page = await browser.newPage({ viewport: { width: 1680, height: 200 } });
    await page.goto(`${server.url}/qa/glyphs.html`);
    await page.evaluate(() => document.fonts.ready);
    const checks = await page.evaluate(
      ({ fams, sample }) => fams.map((f) => ({ family: f, regular: document.fonts.check(`400 56px "${f}"`, sample), bold: document.fonts.check(`700 56px "${f}"`, sample) })),
      { fams, sample },
    );
    await page.screenshot({ path: out, fullPage: true });
    return checks;
  } finally {
    await browser.close();
    await server.close();
  }
}

async function main() {
  const run = loadRun(args.src);
  const src = run.src;
  const qaDir = path.join(src, "qa");
  fs.rmSync(qaDir, { recursive: true, force: true });
  fs.mkdirSync(qaDir, { recursive: true });
  const sb = readJson(path.join(src, "storyboard.json"), null);
  const tokens = readJson(path.join(src, "tokens.json"), {});
  const review = [];
  const report = { run: run.folder, checks: {} };
  if (!findFfmpeg().ffprobe) die("ffprobe not found");

  if (sb) lintStoryboard(sb);
  else warn("storyboard", "storyboard.json missing");
  const msgPath = path.join(run.folder, run.layout.message);
  if (exists(msgPath)) {
    const msg = fs.readFileSync(msgPath, "utf8");
    msg
      .split("\n")
      .forEach((line, i) =>
        lintText(`${run.layout.message}:${i + 1}`, line.replace(/\[(Customer name|Your name|Müşteri adı|Adınız)\]/gi, ""), { onScreen: false, technical: true }),
      );
    if (/\{\{|TODO|TBD/.test(msg)) err(run.layout.message, "template placeholder left in message");
    if (msg.includes("<!--")) err(run.layout.message, "template comment left in message");
  } else warn("message", `${run.layout.message} not written yet`);

  for (const c of tokens.contrast || []) {
    const min = /accent/.test(c.pair) ? 3 : 4.5;
    if (c.ratio < min) err("theme", `${c.pair} contrast ${c.ratio} < ${min}`);
  }
  report.checks.contrast = tokens.contrast || [];
  report.checks.themeAdjustments = tokens.adjustments || [];

  // Video
  const mp4 = path.join(run.folder, run.layout.video);
  if (exists(mp4)) {
    const p = probe(mp4);
    const fast = faststart(mp4);
    report.checks.video = { ...p, faststart: fast, sizeHuman: fmtBytes(p.size) };
    if (p.codec !== "h264") err("video", `codec ${p.codec}, expected h264`);
    if (p.pixFmt !== "yuv420p") err("video", `pix_fmt ${p.pixFmt}, expected yuv420p`);
    if (p.width !== 1920 || p.height !== 1080) err("video", `${p.width}x${p.height}, expected 1920x1080`);
    if (Math.abs(p.fps - 30) > 0.01) err("video", `${p.fps} fps, expected 30`);
    if (p.audio) err("video", "has an audio track; expected none");
    if (!fast) err("video", "moov atom is not at the start (missing +faststart)");
    if (p.size > 25 * 1024 * 1024) warn("video", `${fmtBytes(p.size)} is over the 25 MB email limit`);
    if (p.duration > 90) err("video", `${p.duration.toFixed(1)} s is over the 90 s maximum`);
    if (sb) {
      const scenes = sb.scenes.map((scene, i) => ({ scene, file: sceneFileName(i, scene) }));
      const tl = timeline(scenes);
      if (Math.abs(tl.total - p.duration) > 0.25) warn("video", `duration ${p.duration.toFixed(2)} s differs from storyboard ${tl.total} s`);
      const times = [0.15];
      for (const s of tl.list) times.push(+(s.start + Math.min(s.duration * 0.5, 2)).toFixed(2), +(s.start + s.duration - 0.5).toFixed(2));
      times.push(+Math.max(0, p.duration - 0.1).toFixed(2));
      const frames = [];
      const ff = findFfmpeg();
      for (const t of [...new Set(times)].sort((a, b) => a - b)) {
        const out = path.join(qaDir, `frame-${t.toFixed(2).padStart(6, "0")}s.png`);
        runSync(ff.ffmpeg, ["-v", "error", "-y", "-ss", String(t), "-i", mp4, "-frames:v", "1", "-vf", "scale=1280:-1", out], { timeout: 30000 });
        if (!exists(out)) {
          err("video", `could not extract frame at ${t}s`);
          continue;
        }
        const st = frameStats(out);
        if (st.ymax - st.ymin < 12) err("video", `frame at ${t}s is flat (blank or single colour), YMIN ${st.ymin} YMAX ${st.ymax}`);
        frames.push({ t, file: out, ...st });
      }
      report.checks.frames = frames;
      const sheet = contactSheet(
        frames.map((f) => f.file),
        path.join(qaDir, "frames-contact.png"),
        3,
        640,
      );
      if (sheet) review.push(sheet);
      review.push(...frames.map((f) => f.file));
    }
    const poster = path.join(run.folder, run.layout.poster);
    if (!exists(poster)) warn("video", "poster PNG missing");
    const gif = path.join(run.folder, run.layout.gif);
    if (exists(gif)) {
      const s = fs.statSync(gif).size;
      report.checks.gif = { size: fmtBytes(s) };
      if (s > 10 * 1024 * 1024) warn("gif", `${fmtBytes(s)} is over 10 MB`);
    }
  }

  // Stills and diagrams
  for (const [kind, dirName] of [
    ["images", run.layout.images],
    ["diagrams", run.layout.diagrams],
  ]) {
    const dir = path.join(run.folder, dirName);
    if (!exists(dir)) continue;
    const pngs = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".png"))
      .sort()
      .map((f) => path.join(dir, f));
    report.checks[kind] = pngs.map((f) => {
      const p = probe(f);
      const st = frameStats(f);
      if (st.ymax - st.ymin < 12) err(kind, `${path.basename(f)} looks blank`);
      return { file: f, width: p?.width, height: p?.height, size: fmtBytes(fs.statSync(f).size) };
    });
    if (kind === "images" && !pngs.some((f) => /summary/.test(f))) warn("images", "no summary card (01-summary.png)");
    const sheet = contactSheet(pngs, path.join(qaDir, `${kind}-contact.png`), kind === "images" ? 3 : 2, kind === "images" ? 640 : 960);
    if (sheet) review.push(sheet);
    review.push(...pngs);
  }

  // Fonts and diacritics
  if (exists(path.join(src, "tokens.css"))) {
    const glyphs = path.join(qaDir, "glyphs.png");
    const checks = await glyphCard(src, tokens, glyphs);
    report.checks.fonts = checks;
    for (const c of checks) if (!c.regular || !c.bold) err("fonts", `${c.family} did not load for ${!c.regular ? "regular" : "bold"} text (fallback font would show)`);
    for (const m of tokens.fonts?.missing || []) warn("fonts", `${m} is not installed; Inter was used instead`);
    review.unshift(glyphs);
  }

  report.ok = errors.length === 0;
  report.errors = errors;
  report.warnings = warnings;
  report.review = review;
  writeJson(path.join(qaDir, "report.json"), report);
  process.stdout.write(JSON.stringify({ ok: report.ok, errors, warnings, video: report.checks.video || null, review, report: path.join(qaDir, "report.json") }, null, 2) + "\n");
}

main().catch((e) => die(e.stack || e.message));
