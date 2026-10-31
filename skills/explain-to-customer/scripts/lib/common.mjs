/** Shared helpers for the explain-to-customer scripts. Node built-ins only, so preflight works before setup. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** --help prints the calling script's header comment, which is its usage. */
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  const file = fs.readFileSync(process.argv[1], "utf8");
  const doc = (file.match(/\/\*\*([\s\S]*?)\*\//) || [])[1] || "";
  process.stdout.write(
    doc
      .split("\n")
      .map((l) => l.replace(/^\s*\* ?/, ""))
      .join("\n")
      .trim() + "\n",
  );
  process.exit(0);
}
export const IS_WIN = process.platform === "win32";

/** Tool workspace: XDG cache on macOS/Linux, LOCALAPPDATA on Windows. */
export function workspaceDir(env = process.env, platform = process.platform, home = os.homedir()) {
  if (env.EXPLAIN_TO_CUSTOMER_HOME) return env.EXPLAIN_TO_CUSTOMER_HOME;
  if (platform === "win32") {
    return path.join(env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "explain-to-customer");
  }
  return path.join(env.XDG_CACHE_HOME || path.join(home, ".cache"), "explain-to-customer");
}
export const WS = workspaceDir();

/** Loose argv parser: --k v, --k=v, --flag, repeated keys become arrays, the rest go to _. */
export function parseArgs(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      out._.push(a);
      continue;
    }
    let key = a.slice(2);
    let val = true;
    const eq = key.indexOf("=");
    if (eq >= 0) {
      val = key.slice(eq + 1);
      key = key.slice(0, eq);
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
      val = argv[++i];
    }
    if (key.startsWith("no-") && val === true) {
      key = key.slice(3);
      val = false;
    }
    if (key in out) out[key] = [].concat(out[key], val);
    else out[key] = val;
  }
  return out;
}

export const readJson = (p, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Cannot read JSON ${p}: ${e.message}`);
  }
};
export const writeJson = (p, data) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n");
};
export const exists = (p) => {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
};
export const mkdirp = (p) => fs.mkdirSync(p, { recursive: true });

export function die(msg, code = 1) {
  process.stderr.write(`✗ ${msg}\n`);
  process.exit(code);
}
export const log = (msg) => process.stderr.write(`${msg}\n`);

/** Find an executable on PATH (PATHEXT aware on Windows). */
export function which(cmd, env = process.env) {
  const exts = IS_WIN ? (env.PATHEXT || ".EXE;.CMD;.BAT").split(";") : [""];
  for (const dir of (env.PATH || "").split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const p = path.join(dir, cmd + ext);
      try {
        if (fs.statSync(p).isFile()) return p;
      } catch {
        /* keep looking */
      }
    }
  }
  return null;
}

/** Run a command and capture output. Never throws; check .code. */
export function runSync(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", timeout: opts.timeout ?? 15000, ...opts });
  return { code: r.status ?? (r.error ? -1 : 0), stdout: (r.stdout || "").trim(), stderr: (r.stderr || "").trim(), error: r.error };
}

/** Run a command, streaming output to stderr with an optional prefix. */
export function runStream(cmd, args, opts = {}) {
  const { prefix = "", quiet = false, ...rest } = opts;
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], ...rest });
    let out = "";
    let err = "";
    const pipe = (buf, isErr) => {
      const s = buf.toString();
      if (isErr) err += s;
      else out += s;
      if (!quiet) for (const line of s.split(/\r?\n/)) if (line.trim()) log(`${prefix}${line}`);
    };
    child.stdout.on("data", (b) => pipe(b, false));
    child.stderr.on("data", (b) => pipe(b, true));
    child.on("error", (e) => resolve({ code: -1, stdout: out, stderr: err + e.message }));
    child.on("close", (code) => resolve({ code, stdout: out, stderr: err }));
  });
}

/** Resolve a package entry inside the tool workspace, honouring "exports". */
export function resolveTool(name, sub = "") {
  const dir = path.join(WS, "node_modules", ...name.split("/"));
  const pj = readJson(path.join(dir, "package.json"), null);
  if (!pj) throw new Error(`Package ${name} is not installed in ${WS}. Run setup.mjs first.`);
  if (sub) return path.join(dir, sub);
  const pick = (e) => {
    if (!e) return null;
    if (typeof e === "string") return e;
    if (e["."]) return pick(e["."]);
    return pick(e.import) || pick(e.node) || pick(e.default) || pick(e.require);
  };
  return path.join(dir, pick(pj.exports) || pj.module || pj.main || "index.js");
}
export const importTool = async (name) => import(pathToFileURL(resolveTool(name)).href);

/** Default Playwright browser cache, shared with any other Playwright install on the machine. */
export function playwrightCacheDir(env = process.env, platform = process.platform, home = os.homedir()) {
  if (env.PLAYWRIGHT_BROWSERS_PATH && env.PLAYWRIGHT_BROWSERS_PATH !== "0") return env.PLAYWRIGHT_BROWSERS_PATH;
  if (platform === "darwin") return path.join(home, "Library", "Caches", "ms-playwright");
  if (platform === "win32") return path.join(env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "ms-playwright");
  return path.join(env.XDG_CACHE_HOME || path.join(home, ".cache"), "ms-playwright");
}

function playwrightRevision(browser) {
  const f = path.join(WS, "node_modules", "playwright-core", "browsers.json");
  const data = readJson(f, null);
  return data?.browsers?.find((b) => b.name === browser)?.revision || null;
}

const SYSTEM_CHROME = {
  darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"],
  win32: [
    path.join(process.env["PROGRAMFILES"] || "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe"),
  ],
  linux: ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"],
};

/**
 * One Chromium for everything: Playwright's headless shell first, then its full build, then system Chrome.
 * Returns { path, kind } or null.
 */
export function findChromium() {
  const cache = playwrightCacheDir();
  const candidates = [];
  const shellRev = playwrightRevision("chromium-headless-shell");
  const fullRev = playwrightRevision("chromium");
  const scan = (dirName, rel, kind) => {
    const base = path.join(cache, dirName);
    if (!exists(base)) return;
    for (const sub of fs.readdirSync(base)) {
      for (const r of rel) {
        const p = path.join(base, sub, r);
        if (exists(p)) candidates.push({ path: p, kind });
      }
    }
  };
  if (shellRev) scan(`chromium_headless_shell-${shellRev}`, ["chrome-headless-shell", "chrome-headless-shell.exe"], "headless-shell");
  if (fullRev)
    scan(
      `chromium-${fullRev}`,
      ["Chromium.app/Contents/MacOS/Chromium", "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing", "chrome", "chrome.exe"],
      "chromium",
    );
  for (const p of SYSTEM_CHROME[process.platform] || []) if (exists(p)) candidates.push({ path: p, kind: "system" });
  return candidates[0] || null;
}

/** FFmpeg/ffprobe: system PATH first, then the static builds inside the workspace. */
export function findFfmpeg() {
  const res = { ffmpeg: which("ffmpeg"), ffprobe: which("ffprobe"), source: "system" };
  if (!res.ffmpeg) {
    const p = staticBin("ffmpeg-static");
    if (p) {
      res.ffmpeg = p;
      res.source = "workspace";
    }
  }
  if (!res.ffprobe) {
    const p = staticBin("ffprobe-static");
    if (p) res.ffprobe = p;
  }
  return res;
}
function staticBin(pkg) {
  const dir = path.join(WS, "node_modules", pkg);
  if (!exists(dir)) return null;
  const exe = IS_WIN ? ".exe" : "";
  const direct = path.join(dir, `${pkg.split("-")[0]}${exe}`);
  if (exists(direct)) return direct;
  const nested = path.join(dir, "bin", process.platform, process.arch, `${pkg.split("-")[0]}${exe}`);
  return exists(nested) ? nested : null;
}

/** Env for every render subprocess: local tools on PATH, telemetry off, one shared browser. */
export function renderEnv(extra = {}) {
  const env = { ...process.env, HYPERFRAMES_NO_TELEMETRY: "1", DO_NOT_TRACK: "1", HYPERFRAMES_SKIP_SKILLS: "1", ...extra };
  const ff = findFfmpeg();
  const dirs = [ff.ffmpeg, ff.ffprobe].filter(Boolean).map((p) => path.dirname(p));
  env.PATH = [...new Set(dirs), env.PATH].join(path.delimiter);
  if (ff.ffmpeg) env.HYPERFRAMES_FFMPEG_PATH = ff.ffmpeg;
  if (ff.ffprobe) env.HYPERFRAMES_FFPROBE_PATH = ff.ffprobe;
  const chrome = findChromium();
  if (chrome) {
    env.HYPERFRAMES_BROWSER_PATH = chrome.path;
    env.PUPPETEER_EXECUTABLE_PATH = chrome.path;
  }
  return env;
}

/** Load the run manifest written by preflight --resolve-out. */
export function loadRun(src) {
  if (!src) die("Missing --src <folder>/_source");
  const dir = path.resolve(src);
  const run = readJson(path.join(dir, "run.json"), null);
  if (!run) die(`No run.json in ${dir}. Create the run with preflight.mjs --resolve-out first.`);
  return { ...run, src: dir };
}

export async function launchChromium(opts = {}) {
  const { chromium } = await importTool("playwright");
  const found = findChromium();
  const launch = { headless: true, ...opts };
  if (found && found.kind === "system") launch.executablePath = found.path;
  try {
    return await chromium.launch(launch);
  } catch (e) {
    if (found && !launch.executablePath) return chromium.launch({ ...launch, executablePath: found.path });
    throw e;
  }
}

export function fmtBytes(n) {
  if (n == null) return "?";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
