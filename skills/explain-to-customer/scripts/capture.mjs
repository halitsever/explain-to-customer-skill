#!/usr/bin/env node
/**
 * Screenshots of the running app with numbered highlight boxes, privacy masking and a neutral browser frame.
 *   capture.mjs --plan <capture.json> --src <folder>/_source [--secrets <file.json>]
 * The plan format is documented in reference/capture.md. The secrets file is deleted after the run.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { parseArgs, readJson, exists, die, log, launchChromium, runSync, IS_WIN, fmtBytes } from "./lib/common.mjs";
import { serveDir } from "./lib/static-server.mjs";

const args = parseArgs();
const cleanups = [];

async function waitForUrl(url, timeoutS = 90) {
  const deadline = Date.now() + timeoutS * 1000;
  while (Date.now() < deadline) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1500);
      const r = await fetch(url, { signal: ctrl.signal, redirect: "manual" });
      clearTimeout(t);
      if (r.status < 500) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  try {
    if (IS_WIN) runSync("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
    else process.kill(-child.pid, "SIGTERM");
  } catch {
    /* already gone */
  }
}

/** Start whatever serves the app: a static folder, a dev command, or nothing (URL must already respond). */
async function startServer(serve, baseUrl, label) {
  if (!serve) {
    if (!baseUrl) throw new Error('The plan needs "baseUrl" (a running app) or "serve" ({"static": dir} or {"command", "url"}).');
    if (!(await waitForUrl(baseUrl, 5))) throw new Error(`${baseUrl} does not respond. Start the app or add "serve" to the plan.`);
    return baseUrl;
  }
  if (serve.static) {
    const s = await serveDir(path.resolve(serve.static), { spa: !!serve.spa });
    cleanups.push(() => s.close());
    log(`  ${label}: serving ${serve.static} at ${s.url}`);
    return s.url;
  }
  const url = serve.url || baseUrl;
  const child = spawn(serve.command, {
    cwd: serve.cwd || process.cwd(),
    shell: true,
    detached: !IS_WIN,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, BROWSER: "none", ...(serve.env || {}) },
  });
  let out = "";
  child.stdout.on("data", (b) => {
    out += b;
  });
  child.stderr.on("data", (b) => {
    out += b;
  });
  cleanups.push(() => killTree(child));
  log(`  ${label}: started "${serve.command}", waiting for ${url}`);
  if (!(await waitForUrl(url, serve.timeoutS || 90))) throw new Error(`Dev server did not answer at ${url}. Last output: ${out.slice(-500)}`);
  return url.replace(/\/$/, "");
}

const resolveSecret = (v, secrets) =>
  typeof v === "string"
    ? v.replace(/\$\{secret\.([\w-]+)\}/g, (_, k) => {
        if (!(k in secrets)) throw new Error(`secret "${k}" not provided`);
        return secrets[k];
      })
    : v;

const ACTIONS = ["click", "fill", "type", "press", "hover", "check", "select", "waitFor", "wait", "scrollTo", "goto"];

/** Accepts {fill: [sel, val]}, {fill: {selector, value}}, {fill: sel, value} and {action: 'fill', selector, value}. */
function normalizeAction(a) {
  if (a.action) return { k: a.action, v: ["fill", "type", "press", "select"].includes(a.action) ? [a.selector, a.value ?? a.key] : (a.selector ?? a.ms ?? a.url ?? a.value) };
  const k = Object.keys(a).find((x) => ACTIONS.includes(x));
  if (!k) throw new Error(`Unknown action ${JSON.stringify(a)}. Use one of: ${ACTIONS.join(", ")}`);
  let v = a[k];
  if (v && typeof v === "object" && !Array.isArray(v)) v = ["fill", "type", "press", "select"].includes(k) ? [v.selector, v.value ?? v.key] : (v.selector ?? v.ms ?? v.url);
  else if (["fill", "type", "press", "select"].includes(k) && !Array.isArray(v)) v = [v, a.value ?? a.key ?? a.text];
  return { k, v };
}

async function act(page, a, secrets) {
  const { k, v } = normalizeAction(a);
  if (k === "click") await page.click(v);
  else if (k === "fill") await page.fill(v[0], resolveSecret(v[1], secrets));
  else if (k === "type") await page.type(v[0], resolveSecret(v[1], secrets), { delay: 10 });
  else if (k === "press") await page.press(v[0], v[1]);
  else if (k === "hover") await page.hover(v);
  else if (k === "check") await page.check(v);
  else if (k === "select") await page.selectOption(v[0], v[1]);
  else if (k === "waitFor") await page.waitForSelector(v, { timeout: 15000 });
  else if (k === "wait") await page.waitForTimeout(Math.min(Number(v) || 0, 10000));
  else if (k === "scrollTo") await page.locator(v).first().scrollIntoViewIfNeeded();
  else if (k === "goto") await page.goto(new URL(v, page.url()).href, { waitUntil: "networkidle" });
  else throw new Error(`Unknown action "${k}"`);
}

/** Mark elements whose text or value looks personal or secret; they get covered in the screenshot. */
function autoMaskInPage(allow) {
  const res = [
    /[\w.+-]+@([\w-]+\.)+[a-z]{2,}/i,
    /(?:\+\d{1,3}[\s-]?)?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/,
    /\b(?:\d[ -]?){13,19}\b/,
    /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}\b/,
    /\b(?:sk|pk|ghp|gho|xox[bap])[-_][A-Za-z0-9_-]{12,}\b/,
    /\beyJ[\w-]{10,}\.[\w-]{10,}/,
    /\b[A-Za-z0-9_-]{32,}\b/,
  ];
  const safe = /@(example\.(com|org|net)|test\.(com|local))/i;
  let n = 0;
  const allowed = (s) => allow.some((a) => s.includes(a));
  const hit = (s) => s && res.some((r) => r.test(s)) && !safe.test(s) && !allowed(s);
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (hit(node.nodeValue) && node.parentElement) {
      node.parentElement.setAttribute("data-etc-mask", "");
      n++;
    }
  }
  document.querySelectorAll("input, textarea").forEach((el) => {
    if (el.type === "password" || hit(el.value)) {
      el.setAttribute("data-etc-mask", "");
      n++;
    }
  });
  return n;
}

async function shoot(browser, base, shot, plan, outDir, prefix, secrets, tokens) {
  const vp = plan.viewport || { width: 1440, height: 900 };
  const dpr = plan.dpr || 2;
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: dpr, colorScheme: plan.colorScheme || "light", reducedMotion: "reduce", locale: plan.locale });
  const page = await ctx.newPage();
  const url = new URL(shot.path || "/", base.endsWith("/") ? base : `${base}/`).href;
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  } catch {
    await page.goto(url, { waitUntil: "load", timeout: 30000 });
  }
  for (const a of shot.actions || []) await act(page, a, secrets);
  if (shot.waitFor) await page.waitForSelector(shot.waitFor, { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(shot.settleMs ?? 300);

  // allowText: product copy that only looks personal, e.g. an example address inside an error message.
  const allow = [...(plan.allowText || []), ...(shot.allowText || [])];
  const masked = shot.autoMask === false ? 0 : await page.evaluate(autoMaskInPage, allow);
  const maskSelectors = [...(shot.mask || []), "[data-etc-mask]"];
  const maskLocators = maskSelectors.map((s) => page.locator(s));
  // Make masked text invisible as well, so pixels outside the mask box (descenders, focus rings) reveal nothing.
  await page.addStyleTag({
    content: `${maskSelectors.join(",")}{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;caret-color:transparent!important}`,
  });

  let clip = null;
  if (shot.clip) {
    const box = await page.locator(shot.clip).first().boundingBox();
    if (box) {
      const pad = shot.clipPadding ?? 16;
      // Numbered badges sit left of each box, so a tight crop keeps a 64 px margin on that side.
      const left = (shot.highlights || []).length ? Math.max(pad, 64) : pad;
      const x = Math.max(0, box.x - left);
      clip = { x, y: Math.max(0, box.y - pad), width: Math.min(vp.width - x, box.x - x + box.width + pad), height: box.height + pad * 2 };
    }
  }
  const highlights = [];
  for (const [i, h] of (shot.highlights || []).entries()) {
    const box = await page
      .locator(h.selector)
      .first()
      .boundingBox()
      .catch(() => null);
    if (!box) {
      highlights.push({ ...h, found: false });
      continue;
    }
    highlights.push({ ...h, label: h.label ?? String(i + 1), found: true, x: box.x - (clip?.x || 0), y: box.y - (clip?.y || 0), w: box.width, h: box.height });
  }
  const raw = path.join(outDir, `${prefix}${shot.name}.raw.png`);
  await page.screenshot({
    path: raw,
    clip: clip || undefined,
    fullPage: !!shot.fullPage && !clip,
    mask: maskLocators,
    maskColor: tokens.colors?.muted || "#D4D4D8",
    animations: "disabled",
  });
  await ctx.close();

  // Compose: raw screenshot, highlight boxes, numbered badges, optional neutral browser frame.
  const dims = clip ? { w: clip.width, h: clip.height } : shot.fullPage ? null : { w: vp.width, h: vp.height };
  const comp = await browser.newContext({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: dpr });
  const cp = await comp.newPage();
  const img = `data:image/png;base64,${fs.readFileSync(raw).toString("base64")}`;
  const accent = tokens.colors?.accent || "#2563EB";
  const accentFg = tokens.colors?.accentForeground || "#FFFFFF";
  const frame = plan.frame !== false && shot.frame !== false;
  const address = shot.addressBar ?? plan.addressBar ?? "";
  // Badges sit outside the box (left, else right, else above) so they never cover the highlighted text.
  const W = dims?.w ?? vp.width;
  const badgePos = (h) => {
    const top = Math.max(0, h.y + h.h / 2 - 22);
    if (h.x - 6 - 54 >= 0) return { left: h.x - 6 - 54, top };
    if (h.x + h.w + 6 + 54 <= W) return { left: h.x + h.w + 16, top };
    return { left: Math.max(0, h.x - 6), top: Math.max(0, h.y - 6 - 54) };
  };
  const boxes = highlights
    .filter((h) => h.found)
    .map((h) => {
      const b = badgePos(h);
      return `<div class="hl" style="left:${h.x - 4}px;top:${h.y - 4}px;width:${h.w + 8}px;height:${h.h + 8}px"></div>
    <div class="num" style="left:${b.left}px;top:${b.top}px">${String(h.label).replace(/</g, "&lt;")}</div>`;
    })
    .join("");
  await cp.setContent(`<!doctype html><html><head><style>
    body{margin:0;background:transparent;font-family:system-ui,sans-serif}
    .win{display:inline-block;border-radius:14px;overflow:hidden;background:#fff;box-shadow:0 1px 0 rgba(0,0,0,.04),0 24px 64px -16px rgba(15,23,42,.35);border:1px solid rgba(15,23,42,.12)}
    .bar{height:44px;background:#F1F2F4;display:flex;align-items:center;gap:8px;padding:0 16px;border-bottom:1px solid rgba(15,23,42,.08)}
    .dot{width:12px;height:12px;border-radius:50%;background:#D5D7DB}
    .addr{margin-left:16px;flex:1;height:26px;border-radius:13px;background:#fff;border:1px solid rgba(15,23,42,.08);font-size:13px;color:#5B616B;display:flex;align-items:center;padding:0 14px}
    .canvas{position:relative;line-height:0}
    .canvas img{display:block;${dims ? `width:${dims.w}px;height:${dims.h}px;` : ""}}
    .hl{position:absolute;border:3px solid ${accent};border-radius:10px;box-shadow:0 0 0 3px color-mix(in srgb, ${accent} 20%, transparent)}
    .num{position:absolute;width:44px;height:44px;border-radius:50%;background:${accent};color:${accentFg};font:700 24px/44px system-ui,sans-serif;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,.25)}
  </style></head><body><div class="${frame ? "win" : ""}" id="out">${frame ? `<div class="bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="addr">${String(address).replace(/</g, "&lt;")}</span></div>` : ""}<div class="canvas"><img src="${img}">${boxes}</div></div></body></html>`);
  if (!dims) {
    const natural = await cp.evaluate(() => {
      const i = document.querySelector("img");
      return { w: i.naturalWidth, h: i.naturalHeight };
    });
    await cp.evaluate(
      (d) => {
        const i = document.querySelector("img");
        i.style.width = `${d.w}px`;
        i.style.height = `${d.h}px`;
      },
      { w: natural.w / dpr, h: natural.h / dpr },
    );
  }
  const outFile = path.join(outDir, `${prefix}${shot.name}.png`);
  await cp.locator("#out").screenshot({ path: outFile, omitBackground: true });
  await comp.close();
  return {
    name: `${prefix}${shot.name}`,
    url: url.replace(base, ""),
    file: outFile,
    raw,
    size: fmtBytes(fs.statSync(outFile).size),
    masked,
    highlights: highlights.map(({ selector, label, found }) => ({ selector, label, found })),
  };
}

function gitTop(cwd) {
  const r = runSync("git", ["rev-parse", "--show-toplevel"], { cwd });
  return r.code === 0 ? r.stdout : null;
}

/** "Before" shots come from a temporary worktree of the base revision; the user's working tree is never touched. */
async function beforeWorktree(plan, projectRoot) {
  const top = gitTop(projectRoot);
  if (!top) throw new Error('"before" needs a git repository');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "etc-before-"));
  const add = runSync("git", ["worktree", "add", "--detach", dir, plan.before.ref], { cwd: top, timeout: 120000 });
  if (add.code !== 0) throw new Error(`git worktree add failed: ${add.stderr}`);
  cleanups.push(() => {
    runSync("git", ["worktree", "remove", "--force", dir], { cwd: top, timeout: 60000 });
    runSync("git", ["worktree", "prune"], { cwd: top });
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const nm = path.join(top, "node_modules");
  if (exists(nm) && !exists(path.join(dir, "node_modules"))) fs.symlinkSync(nm, path.join(dir, "node_modules"), IS_WIN ? "junction" : "dir");
  return { top, dir };
}

async function main() {
  if (!args.plan) die("Missing --plan <capture.json>");
  const plan = readJson(args.plan);
  const src = args.src ? path.resolve(args.src) : null;
  const tokens = src ? readJson(path.join(src, "tokens.json"), {}) : {};
  const outDir = path.resolve(plan.outDir || (src ? path.join(src, "assets") : "assets"));
  fs.mkdirSync(outDir, { recursive: true });
  let secrets = {};
  if (args.secrets) {
    secrets = readJson(args.secrets);
    if (!args["keep-secrets"]) cleanups.push(() => fs.rmSync(args.secrets, { force: true }));
  }
  const results = [];
  const failures = [];
  let browser;
  try {
    const base = await startServer(plan.serve, plan.baseUrl, "after");
    browser = await launchChromium();
    for (const shot of plan.shots || []) {
      try {
        results.push(await shoot(browser, base, shot, plan, outDir, "", secrets, tokens));
        log(`✓ ${shot.name}`);
      } catch (e) {
        failures.push({ shot: shot.name, error: e.message });
        log(`✗ ${shot.name}: ${e.message}`);
      }
    }
    if (plan.before?.ref) {
      const projectRoot = path.resolve(plan.projectRoot || process.cwd());
      const { top, dir } = await beforeWorktree(plan, projectRoot);
      const bServe = { ...(plan.before.serve || plan.serve || {}) };
      if (bServe.static) bServe.static = path.join(dir, path.relative(top, path.resolve(projectRoot, bServe.static)));
      if (bServe.command) bServe.cwd = path.join(dir, path.relative(top, path.resolve(bServe.cwd || projectRoot)));
      const bBase = await startServer(bServe, plan.before.baseUrl || plan.baseUrl, "before");
      const shots = (plan.shots || []).filter((s) => (plan.before.shots ? plan.before.shots.includes(s.name) : true));
      for (const shot of shots) {
        const s = { ...shot, actions: shot.beforeActions || shot.actions, highlights: shot.beforeHighlights || [] };
        try {
          results.push(await shoot(browser, bBase, s, plan, outDir, "before-", secrets, tokens));
          log(`✓ before-${shot.name}`);
        } catch (e) {
          failures.push({ shot: `before-${shot.name}`, error: e.message });
          log(`✗ before-${shot.name}: ${e.message}`);
        }
      }
    }
  } finally {
    if (browser) await browser.close();
    for (const c of cleanups.reverse()) {
      try {
        await c();
      } catch {
        /* best effort */
      }
    }
  }
  process.stdout.write(JSON.stringify({ ok: failures.length === 0, outDir, shots: results, failures }, null, 2) + "\n");
  if (failures.length && !results.length) process.exit(1);
}

process.on("SIGINT", async () => {
  for (const c of cleanups.reverse()) {
    try {
      await c();
    } catch {
      /* best effort */
    }
  }
  process.exit(130);
});
main().catch((e) => die(e.stack || e.message));
