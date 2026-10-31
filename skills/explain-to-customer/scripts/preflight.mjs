#!/usr/bin/env node
/**
 * Preflight: one JSON blob with OS, project, git scope, save paths, tools, dev server and last-used answers.
 *   preflight.mjs [--project DIR]
 *   preflight.mjs --resolve-out project|cwd|desktop|videos|PATH --title "Change title" [--lang tr] [--audience customer]
 *   preflight.mjs --remember '{"format":"video","saveTo":"project","style":"shadcn","screenshots":"running"}'
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs, readJson, writeJson, exists, which, runSync, WS, findChromium, findFfmpeg, log, die } from "./lib/common.mjs";
import { resolveSaveRoots, planRun, today, detectWSL, slugify } from "./lib/paths.mjs";

const args = parseArgs();
const cwd = path.resolve(args.project || process.cwd());
const STATE = path.join(WS, "state.json");

const git = (...a) => {
  const r = runSync("git", a, { cwd, timeout: 8000 });
  return r.code === 0 ? r.stdout : null;
};
const execOut = (cmd, a) => {
  const r = runSync(cmd, a, { timeout: 6000 });
  return r.code === 0 && r.stdout ? r.stdout : null;
};

function gitInfo() {
  const top = git("rev-parse", "--show-toplevel");
  if (!top) return { isGit: false };
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  const hasHead = !!git("rev-parse", "--verify", "-q", "HEAD");
  let defaultBranch = (git("symbolic-ref", "--short", "refs/remotes/origin/HEAD") || "").replace(/^origin\//, "") || null;
  if (!defaultBranch) {
    defaultBranch = ["main", "master", "develop", "trunk"].find((b) => git("rev-parse", "--verify", "-q", `refs/heads/${b}`)) || null;
  }
  const status = (git("status", "--porcelain") || "").split("\n").filter(Boolean);
  const uncommitted = {
    staged: status.filter((l) => /^[MADRC]/.test(l)).length,
    unstaged: status.filter((l) => /^.[MD]/.test(l)).length,
    untracked: status.filter((l) => l.startsWith("??")).length,
  };
  const dirty = status.length > 0;
  const last = hasHead ? (git("log", "-1", "--format=%h%x09%s%x09%cI") || "").split("\t") : [];
  const isDefault = !branch || branch === defaultBranch || branch === "HEAD";
  let scope;
  if (!hasHead) {
    scope = { kind: "uncommitted", label: "Uncommitted changes (no commits yet)", diffStat: ["git", "status", "--short"] };
  } else if (!isDefault && defaultBranch) {
    const base = git("merge-base", "HEAD", defaultBranch);
    const ahead = base ? Number(git("rev-list", "--count", `${base}..HEAD`) || 0) : 0;
    scope = {
      kind: "branch",
      base,
      baseShort: base?.slice(0, 7),
      ahead,
      includesUncommitted: dirty,
      label: `${branch}: ${ahead} commit(s) since ${defaultBranch}${dirty ? " + uncommitted changes" : ""}`,
      diffStat: ["git", "diff", "--stat", base || defaultBranch],
      log: ["git", "log", "--oneline", `${base || defaultBranch}..HEAD`],
    };
  } else if (dirty) {
    scope = { kind: "uncommitted", label: "Uncommitted changes", diffStat: ["git", "diff", "--stat", "HEAD"], untracked: uncommitted.untracked };
  } else {
    scope = { kind: "last-commit", label: `Last commit ${last[0]}: ${last[1]}`, diffStat: ["git", "show", "--stat", "--format=%h %s", "HEAD"] };
  }
  return {
    isGit: true,
    root: top,
    branch,
    defaultBranch,
    isDefaultBranch: isDefault,
    hasHead,
    uncommitted,
    lastCommit: last.length ? { hash: last[0], subject: last[1], date: last[2] } : null,
    suggestedScope: scope,
  };
}

const FRAMEWORK_PORTS = [
  ["next", 3000],
  ["nuxt", 3000],
  ["@remix-run/dev", 5173],
  ["vite", 5173],
  ["@sveltejs/kit", 5173],
  ["astro", 4321],
  ["@angular/core", 4200],
  ["gatsby", 8000],
  ["react-scripts", 3000],
  ["@vue/cli-service", 8080],
];
const PROBE_PORTS = [3000, 3001, 5173, 5174, 4321, 4200, 8080, 8000, 4173, 5000, 3333, 4000, 8081, 8888, 9000, 6006, 1313];

function projectInfo(root) {
  const pkg = readJson(path.join(root, "package.json"), null);
  const lock = [
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["bun.lockb", "bun"],
    ["bun.lock", "bun"],
    ["package-lock.json", "npm"],
  ].find(([f]) => exists(path.join(root, f)));
  const pm = lock ? lock[1] : pkg ? "npm" : null;
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  const scripts = pkg?.scripts || {};
  const devScript = ["dev", "start", "serve", "preview"].find((s) => scripts[s]);
  let expectedPort = null;
  const scriptText = devScript ? scripts[devScript] : "";
  const m = scriptText.match(/(?:--port[= ]|-p\s+|PORT=)(\d{2,5})/);
  if (m) expectedPort = Number(m[1]);
  const framework = FRAMEWORK_PORTS.find(([d]) => deps[d]);
  if (!expectedPort && framework) expectedPort = framework[1];
  const storybook = exists(path.join(root, ".storybook")) || !!deps.storybook || Object.keys(deps).some((d) => d.startsWith("@storybook/"));
  const staticSite = !pkg && (exists(path.join(root, "index.html")) || exists(path.join(root, "public", "index.html")));
  let readmeTitle = null;
  for (const f of ["README.md", "readme.md", "Readme.md"]) {
    const p = path.join(root, f);
    if (exists(p)) {
      readmeTitle = (fs.readFileSync(p, "utf8").match(/^#\s+(.+)$/m) || [])[1]?.trim() || null;
      break;
    }
  }
  return {
    root,
    name: (pkg?.name || "").replace(/^@[^/]+\//, "") || path.basename(root),
    displayName: pkg?.productName || pkg?.displayName || readmeTitle || null,
    hasPackageJson: !!pkg,
    packageManager: pm,
    framework: framework ? framework[0] : null,
    scripts: Object.fromEntries(Object.entries(scripts).filter(([k]) => /^(dev|start|serve|preview|storybook)$/.test(k))),
    devCommand: devScript ? `${pm === "npm" ? "npm run" : pm} ${devScript}` : null,
    expectedPort,
    storybook,
    storybookCommand: scripts.storybook ? `${pm === "npm" ? "npm run" : pm} storybook` : null,
    staticSite,
  };
}

async function probe(port) {
  for (const host of ["127.0.0.1", "[::1]"]) {
    const url = `http://${host}:${port}/`;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 700);
      const res = await fetch(url, { signal: ctrl.signal, redirect: "manual" });
      const body = res.status < 400 ? (await res.text()).slice(0, 4000) : "";
      clearTimeout(t);
      const title = (body.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1]?.trim() || null;
      return { port, url: `http://localhost:${port}/`, status: res.status, title };
    } catch {
      /* not listening on this host */
    }
  }
  return null;
}

async function devServer(project) {
  const ports = [...new Set([project.expectedPort, ...PROBE_PORTS].filter(Boolean))];
  const all = (await Promise.all(ports.map(probe))).filter(Boolean);
  // 4xx at / is usually something else (macOS AirPlay answers 403 on 5000), not a dev server.
  const found = all.filter((f) => f.status < 400);
  const expected = found.find((f) => f.port === project.expectedPort) || null;
  const storybook = found.find((f) => f.port === 6006) || null;
  return {
    responding: found,
    recommendedUrl: expected?.url || null,
    note: expected
      ? "Expected port for this project responds."
      : found.length
        ? "Something responds, but not on the port this project expects. Check the title before using it."
        : "No dev server responds.",
    storybookUrl: storybook?.url || null,
    startCommand: project.devCommand,
    expectedUrl: project.expectedPort ? `http://localhost:${project.expectedPort}/` : null,
    staticServe: project.staticSite ? 'No dev server needed: capture.mjs can serve the project folder with "serve": {"static": "<projectRoot>"}' : null,
    ignored: all.filter((f) => f.status >= 400).map((f) => `${f.url} (HTTP ${f.status})`),
  };
}

function versionOf(bin, flag = "-version") {
  if (!bin) return null;
  const r = runSync(bin, [flag], { timeout: 6000 });
  return r.code === 0 ? (r.stdout.split("\n")[0] || "").slice(0, 80) : null;
}

function workspaceStatus() {
  const pkgPath = path.join(WS, "package.json");
  const pkg = readJson(pkgPath, null);
  const required = ["hyperframes", "playwright", "@mermaid-js/mermaid-cli", "gsap", "culori", "ajv", "roughjs"];
  const missing = required.filter((n) => !exists(path.join(WS, "node_modules", ...n.split("/"), "package.json")));
  const hf = readJson(path.join(WS, "node_modules", "hyperframes", "package.json"), null);
  return { path: WS, installed: !!pkg && missing.length === 0, missing, hyperframes: hf?.version || null };
}

function installHint(platform, isWSL) {
  if (platform === "darwin") return "brew install ffmpeg";
  if (platform === "win32") return "winget install Gyan.FFmpeg";
  return isWSL ? "sudo apt install ffmpeg" : "sudo apt install ffmpeg   (Fedora: sudo dnf install ffmpeg)";
}

function saveContext(projectRoot, projectName) {
  return {
    platform: process.platform,
    env: process.env,
    home: os.homedir(),
    cwd,
    projectRoot,
    projectName,
    workspace: WS,
    date: today(),
    exec: execOut,
    exists: (p) => exists(p),
  };
}

async function main() {
  if (args.remember) {
    const state = readJson(STATE, {});
    let patch;
    try {
      patch = JSON.parse(args.remember);
    } catch {
      die("--remember expects a JSON object");
    }
    state.lastUsed = { ...(state.lastUsed || {}), ...patch, at: new Date().toISOString() };
    writeJson(STATE, state);
    process.stdout.write(JSON.stringify({ ok: true, lastUsed: state.lastUsed }, null, 2) + "\n");
    return;
  }

  const g = gitInfo();
  const projectRoot = g.root || cwd;
  const project = projectInfo(projectRoot);

  if (args["resolve-out"]) {
    const choiceRaw = String(args["resolve-out"]);
    const choice = ["project", "cwd", "desktop", "videos"].includes(choiceRaw) ? choiceRaw : "path";
    const ctx = saveContext(projectRoot, project.name);
    const { roots } = resolveSaveRoots(ctx);
    const plan = planRun({
      choice,
      roots,
      project: project.name,
      date: ctx.date,
      title: args.title || "change",
      customPath: choice === "path" ? choiceRaw : undefined,
      home: ctx.home,
      env: process.env,
    });
    try {
      fs.mkdirSync(plan.folder, { recursive: true });
      fs.mkdirSync(plan.src, { recursive: true });
    } catch (e) {
      if (e.code === "EPERM" || /not permitted/i.test(e.message)) {
        die(`Cannot write to ${plan.folder}: Operation not permitted. On macOS allow your terminal app in System Settings → Privacy & Security → Files and Folders, then retry.`);
      }
      die(`Cannot create ${plan.folder}: ${e.message}`);
    }
    // Step 7 offers a .gitignore entry; answering here spares the model git commands that need approval.
    const top = runSync("git", ["-C", plan.folder, "rev-parse", "--show-toplevel"], { timeout: 8000 });
    const inRepo = top.code === 0 && !!top.stdout;
    const ignored = inRepo && runSync("git", ["-C", top.stdout, "check-ignore", "-q", plan.folder], { timeout: 8000 }).code === 0;
    const gitignore = inRepo
      ? {
          inRepo,
          ignored,
          repoRoot: top.stdout,
          entry: ignored
            ? null
            : `${path
                .relative(top.stdout, choice === "project" ? path.dirname(plan.folder) : plan.folder)
                .split(path.sep)
                .join("/")}/`,
        }
      : { inRepo: false };
    const run = {
      ...plan,
      choice,
      title: args.title || null,
      project: project.name,
      projectRoot,
      lang: args.lang || null,
      audience: args.audience || "customer",
      createdAt: new Date().toISOString(),
      gitignore,
    };
    writeJson(path.join(plan.src, "run.json"), run);
    process.stdout.write(JSON.stringify(run, null, 2) + "\n");
    return;
  }

  const ctx = saveContext(projectRoot, project.name);
  const { roots, isWSL } = resolveSaveRoots(ctx);
  const dateStr = ctx.date;
  const pname = slugify(project.name, 30);
  const savePaths = {
    project: { label: roots.project.label, example: path.join(roots.project.base, `${dateStr}-<slug>`) },
    cwd: { label: roots.cwd.label, example: path.join(roots.cwd.base, "<slug>.mp4 …"), sources: path.join(roots.cwd.sourcesBase, `${pname}-${dateStr}-<slug>`) },
    desktop: { label: roots.desktop.label, exists: roots.desktop.exists, example: path.join(roots.desktop.base, `${pname}-${dateStr}-<slug>`) },
    videos: { label: roots.videos.label, exists: roots.videos.exists, example: path.join(roots.videos.base, `${pname}-${dateStr}-<slug>`) },
  };

  const ff = findFfmpeg();
  const chrome = findChromium();
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  const ws = workspaceStatus();
  const state = readJson(STATE, {});
  const ghPath = which("gh");

  const out = {
    os: { platform: process.platform, release: os.release(), arch: process.arch, isWSL: isWSL || detectWSL({ platform: process.platform, env: process.env }) },
    node: { version: process.versions.node, ok: nodeMajor >= 22, videoEngine: nodeMajor >= 22 ? "hyperframes" : "playwright-fallback" },
    cwd,
    project,
    git: g,
    savePaths,
    tools: {
      ffmpeg: ff.ffmpeg
        ? { path: ff.ffmpeg, version: versionOf(ff.ffmpeg), source: ff.source }
        : { missing: true, install: installHint(process.platform, isWSL), noAdminFallback: "setup.mjs --ffmpeg-static" },
      ffprobe: ff.ffprobe ? { path: ff.ffprobe } : { missing: true },
      gh: ghPath ? { path: ghPath } : { missing: true },
      chromium: chrome || { missing: true },
      workspace: ws,
      firstRun: !ws.installed,
    },
    devServer: project.hasPackageJson || project.staticSite ? await devServer(project) : { responding: [], note: "No package.json or static site detected." },
    lastUsed: state.lastUsed || null,
    date: dateStr,
  };
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
}

main().catch((e) => {
  log(e.stack || e.message);
  process.exit(1);
});
