#!/usr/bin/env node
/**
 * One-time toolchain install into the tool workspace. The user's project is never touched.
 *   setup.mjs --dry-run          JSON: what is missing and roughly how many MB it downloads
 *   setup.mjs                    install everything missing, with progress
 *   setup.mjs --ffmpeg-static    also install a no-admin FFmpeg/ffprobe build into the workspace
 *   setup.mjs --add-font "Poppins"   add one more @fontsource family (used by "Match my project")
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { parseArgs, WS, readJson, writeJson, exists, mkdirp, runStream, IS_WIN, log, die, findFfmpeg, playwrightCacheDir } from "./lib/common.mjs";

const args = parseArgs();

const PINNED = {
  hyperframes: "0.8.225",
  playwright: "1.64.1",
  "@mermaid-js/mermaid-cli": "12.0.0",
  gsap: "3.15.0",
  culori: "4.0.2",
  ajv: "8.20.0",
  roughjs: "4.6.6",
};
const FONT_PACKAGES = [
  "inter",
  "inter-tight",
  "geist-sans",
  "geist-mono",
  "ibm-plex-sans",
  "ibm-plex-mono",
  "jetbrains-mono",
  "roboto",
  "space-grotesk",
  "archivo-black",
  "plus-jakarta-sans",
  "source-serif-4",
  "caveat",
  "kalam",
  "nunito",
  "mona-sans",
];
const FONT_VERSION = { "source-serif-4": "5.3.1" };
const STATIC_FFMPEG = { "ffmpeg-static": "5.3.0", "ffprobe-static": "3.1.0" };
const SELAWIK = {
  url: "https://github.com/microsoft/Selawik/releases/download/1.01/Selawik_Release.zip",
  sha256: "3f62c51e05e3b5a1e6241cf92a371f0be2ea1183aa87b30718bbd40832a8d423",
  license: "https://raw.githubusercontent.com/microsoft/Selawik/main/LICENSE.txt",
  files: { "selawkl.woff2": 300, "selawk.woff2": 400, "selawksb.woff2": 600, "selawkb.woff2": 700 },
};
// Download sizes measured on a clean macOS arm64 install, Nov 2026. On disk: ~600 MB npm, ~200 MB Chromium.
const APPROX_MB = { npm: 151, chromiumShell: 99, selawik: 1, ffmpegStatic: 75 };

const FONTS_DIR = path.join(WS, "fonts");
const pkgJsonPath = path.join(WS, "package.json");

function wantedDeps(extraFonts = []) {
  const deps = { ...PINNED };
  for (const f of FONT_PACKAGES) deps[`@fontsource/${f}`] = FONT_VERSION[f] || "5.3.0";
  for (const f of extraFonts) deps[`@fontsource/${f}`] = "latest";
  return deps;
}
const installed = (name) => exists(path.join(WS, "node_modules", ...name.split("/"), "package.json"));

function shellRevision() {
  const data = readJson(path.join(WS, "node_modules", "playwright-core", "browsers.json"), null);
  return data?.browsers?.find((b) => b.name === "chromium-headless-shell")?.revision || null;
}
function shellCached(rev) {
  const dir = path.join(playwrightCacheDir(), `chromium_headless_shell-${rev}`);
  return exists(dir) && fs.readdirSync(dir).some((d) => !d.startsWith(".") && !d.endsWith(".zip"));
}
/** Without node_modules we cannot read the revision, so check for any cached shell from a matching Playwright. */
function anyShellCached() {
  const cache = playwrightCacheDir();
  return exists(cache) && fs.readdirSync(cache).some((d) => d.startsWith("chromium_headless_shell-"));
}

function plan() {
  const deps = wantedDeps();
  const missingPkgs = Object.keys(deps).filter((n) => !installed(n));
  const rev = shellRevision();
  const chromiumNeeded = rev ? !shellCached(rev) : !anyShellCached();
  const selawikNeeded = !exists(path.join(FONTS_DIR, "selawik", "selawk.woff2"));
  const ff = findFfmpeg();
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  const steps = [
    {
      step: "npm packages",
      needed: missingPkgs.length > 0,
      approxMB: missingPkgs.length ? APPROX_MB.npm : 0,
      detail: missingPkgs.length ? `${missingPkgs.length} package(s): ${missingPkgs.slice(0, 8).join(", ")}${missingPkgs.length > 8 ? " …" : ""}` : "all present",
    },
    {
      step: "Chromium headless shell (Playwright cache, shared)",
      needed: chromiumNeeded,
      approxMB: chromiumNeeded ? APPROX_MB.chromiumShell : 0,
      detail: chromiumNeeded ? `into ${playwrightCacheDir()}` : "already cached",
    },
    { step: "Selawik font (Fluent style)", needed: selawikNeeded, approxMB: selawikNeeded ? APPROX_MB.selawik : 0 },
  ];
  if (args["ffmpeg-static"]) steps.push({ step: "FFmpeg static build", needed: !installed("ffmpeg-static"), approxMB: installed("ffmpeg-static") ? 0 : APPROX_MB.ffmpegStatic });
  return {
    workspace: WS,
    firstRun: missingPkgs.length > 0,
    steps,
    totalMB: steps.reduce((a, s) => a + s.approxMB, 0),
    node: { version: process.versions.node, ok: nodeMajor >= 22 },
    ffmpeg: ff.ffmpeg ? { path: ff.ffmpeg, source: ff.source } : { missing: true, hint: "Ask the user: install system FFmpeg, or run setup.mjs --ffmpeg-static" },
  };
}

function npmCmd() {
  return IS_WIN ? "npm.cmd" : "npm";
}

async function npmInstall(specs) {
  const started = Date.now();
  const timer = setInterval(() => log(`  … still installing (${Math.round((Date.now() - started) / 1000)} s)`), 10000);
  const r = await runStream(npmCmd(), ["install", "--no-audit", "--no-fund", "--loglevel=error", "--progress=false", ...specs], {
    cwd: WS,
    shell: IS_WIN,
    prefix: "  npm: ",
    env: { ...process.env, PUPPETEER_SKIP_DOWNLOAD: "1", PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: "1" },
  });
  clearInterval(timer);
  if (r.code !== 0) die(`npm install failed (exit ${r.code}). See the output above.`);
  log(`  done in ${Math.round((Date.now() - started) / 1000)} s`);
}

async function download(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function installSelawik() {
  const dir = path.join(FONTS_DIR, "selawik");
  mkdirp(dir);
  const zip = await download(SELAWIK.url);
  const sum = crypto.createHash("sha256").update(zip).digest("hex");
  if (sum !== SELAWIK.sha256) throw new Error(`Selawik checksum mismatch (${sum})`);
  const { default: AdmZip } = await import(new URL(`file://${path.join(WS, "node_modules", "adm-zip", "adm-zip.js")}`).href);
  const z = new AdmZip(zip);
  for (const name of Object.keys(SELAWIK.files)) {
    const entry = z.getEntries().find((e) => e.entryName.endsWith(name));
    if (!entry) throw new Error(`${name} missing from Selawik zip`);
    fs.writeFileSync(path.join(dir, name), entry.getData());
  }
  let license;
  try {
    license = (await download(SELAWIK.license)).toString("utf8");
  } catch {
    license =
      "Copyright 2015, Microsoft Corporation (www.microsoft.com), with Reserved Font Name Selawik.\nThis Font Software is licensed under the SIL Open Font License, Version 1.1.\nhttps://openfontlicense.org\n";
  }
  fs.writeFileSync(path.join(dir, "LICENSE"), license);
  writeJson(path.join(dir, "weights.json"), SELAWIK.files);
}

async function main() {
  mkdirp(WS);
  if (args["dry-run"]) {
    process.stdout.write(JSON.stringify(plan(), null, 2) + "\n");
    return;
  }

  if (args["add-font"]) {
    const id = String(args["add-font"]).toLowerCase().trim().replace(/\s+/g, "-");
    log(`Adding @fontsource/${id} …`);
    await npmInstall([`@fontsource/${id}`]);
    const pkg = readJson(pkgJsonPath);
    process.stdout.write(JSON.stringify({ ok: true, package: `@fontsource/${id}`, version: pkg.dependencies?.[`@fontsource/${id}`] }) + "\n");
    return;
  }

  const p = plan();
  const total = p.steps.filter((s) => s.needed).length + 1;
  let n = 0;
  log(`Tool workspace: ${WS}`);
  log(`Estimated download: ~${p.totalMB} MB`);

  log(`[${++n}/${total}] Writing package.json with pinned versions`);
  const pkg = readJson(pkgJsonPath, {
    name: "explain-to-customer-tools",
    private: true,
    type: "module",
    description: "Rendering toolchain for the explain-to-customer Claude Code skill.",
  });
  pkg.dependencies = { ...(pkg.dependencies || {}), ...wantedDeps() };
  if (args["ffmpeg-static"]) Object.assign(pkg.dependencies, STATIC_FFMPEG);
  writeJson(pkgJsonPath, pkg);

  const npmStep = p.steps.find((s) => s.step === "npm packages");
  if (npmStep.needed || args["ffmpeg-static"]) {
    log(`[${++n}/${total}] Installing npm packages (~${APPROX_MB.npm} MB)`);
    await npmInstall([]);
  }

  const rev = shellRevision();
  if (!rev || !shellCached(rev)) {
    log(`[${++n}/${total}] Downloading Chromium headless shell for Playwright (~${APPROX_MB.chromiumShell} MB)`);
    const cli = path.join(WS, "node_modules", "playwright", "cli.js");
    const r = await runStream(process.execPath, [cli, "install", "--only-shell", "chromium"], { cwd: WS, prefix: "  playwright: " });
    if (r.code !== 0) die("Chromium download failed. Retry, or set PLAYWRIGHT_DOWNLOAD_HOST if a proxy blocks it.");
  }

  if (!exists(path.join(FONTS_DIR, "selawik", "selawk.woff2"))) {
    log(`[${++n}/${total}] Downloading Selawik font (open replacement for Segoe UI, ~0.5 MB)`);
    try {
      await installSelawik();
    } catch (e) {
      log(`  ! Selawik skipped: ${e.message}. Fluent style falls back to Inter.`);
    }
  }

  const after = plan();
  const ok = after.steps.every((s) => !s.needed || s.step.startsWith("Selawik"));
  log(ok ? "✓ Toolchain ready." : "✗ Some steps are still missing, see JSON.");
  process.stdout.write(JSON.stringify({ ok, ...after }, null, 2) + "\n");
  if (!ok) process.exit(1);
}

main().catch((e) => die(e.stack || e.message));
