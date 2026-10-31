/** Save-location resolution. Pure functions with injectable platform, env and exec so tests can stub every OS. */
import fs from "node:fs";
import path from "node:path";

const TRANSLIT = {
  ç: "c",
  Ç: "c",
  ğ: "g",
  Ğ: "g",
  ı: "i",
  İ: "i",
  ö: "o",
  Ö: "o",
  ş: "s",
  Ş: "s",
  ü: "u",
  Ü: "u",
  ä: "a",
  Ä: "a",
  ß: "ss",
  æ: "ae",
  Æ: "ae",
  ø: "o",
  Ø: "o",
  å: "a",
  Å: "a",
  œ: "oe",
  Œ: "oe",
  ł: "l",
  Ł: "l",
  đ: "d",
  Đ: "d",
};

/** Kebab-case ASCII, diacritics transliterated, at most `max` chars, cut on a word boundary when possible. */
export function slugify(text, max = 40) {
  const ascii = String(text ?? "")
    .replace(/[^\u0000-\u007F]/g, (c) => TRANSLIT[c] ?? c)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (ascii.length <= max) return ascii || "change";
  const cut = ascii.slice(0, max);
  const lastDash = cut.lastIndexOf("-");
  return (lastDash > max * 0.5 ? cut.slice(0, lastDash) : cut).replace(/-+$/g, "") || "change";
}

export const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Expand ~, $VAR, ${VAR} and %VAR% in a user-supplied path. */
export function expandUserPath(p, { home, env = {}, platform = process.platform } = {}) {
  let s = String(p)
    .trim()
    .replace(/^["']|["']$/g, "");
  if (s === "~" || s.startsWith("~/") || s.startsWith("~\\")) s = home + s.slice(1);
  s = s.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (m, a, b) => env[a || b] ?? m);
  s = s.replace(/%([A-Za-z_][A-Za-z0-9_()]*)%/g, (m, a) => {
    const key = Object.keys(env).find((k) => k.toLowerCase() === a.toLowerCase());
    return key ? env[key] : m;
  });
  const p2 = platform === "win32" ? path.win32 : path.posix;
  return p2.normalize(s);
}

export function detectWSL({ platform, env = {}, readFile = (f) => fs.readFileSync(f, "utf8") } = {}) {
  if (platform !== "linux") return false;
  if (env.WSL_DISTRO_NAME || env.WSL_INTEROP) return true;
  try {
    return /microsoft/i.test(readFile("/proc/version"));
  } catch {
    return false;
  }
}

/** Parse ~/.config/user-dirs.dirs for an XDG key such as DESKTOP or VIDEOS. */
function xdgFromFile(key, { home, env, readFile }) {
  const cfg = path.posix.join(env.XDG_CONFIG_HOME || path.posix.join(home, ".config"), "user-dirs.dirs");
  try {
    const m = readFile(cfg).match(new RegExp(`^XDG_${key}_DIR="?([^"\\n]+)"?`, "m"));
    if (m) return m[1].replace(/\$HOME/g, home);
  } catch {
    /* file is optional */
  }
  return null;
}

function xdgDir(key, ctx) {
  const { home, exec } = ctx;
  let dir = exec("xdg-user-dir", [key]);
  if (!dir) dir = xdgFromFile(key, ctx);
  if (!dir) return null;
  dir = dir.replace(/\/+$/, "");
  return dir === home.replace(/\/+$/, "") ? null : dir;
}

function windowsKnownFolder(name, ctx) {
  const { exec } = ctx;
  const out =
    exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `[Environment]::GetFolderPath('${name}')`]) ||
    exec("powershell", ["-NoProfile", "-NonInteractive", "-Command", `[Environment]::GetFolderPath('${name}')`]);
  return out ? out.trim() : null;
}

function wslWindowsFolder(name, fallbackLeaf, ctx) {
  const { exec } = ctx;
  let win = windowsKnownFolder(name, ctx);
  if (!win) {
    const profile = exec("cmd.exe", ["/c", "echo %USERPROFILE%"]);
    if (profile && !profile.includes("%")) win = `${profile.trim()}\\${fallbackLeaf}`;
  }
  if (!win) return null;
  const linux = exec("wslpath", ["-u", win]);
  return linux ? linux.trim() : null;
}

/**
 * Resolve the base directories behind each "Save to" option.
 * ctx: { platform, env, home, cwd, projectRoot, projectName, workspace, date, exec(cmd,args)->string|null, exists(p)->bool, readFile }
 */
export function resolveSaveRoots(ctx) {
  const { platform, env = {}, home, cwd, projectRoot, projectName, workspace } = ctx;
  const existsFn = ctx.exists || ((p) => fs.existsSync(p));
  const c = { ...ctx, env, readFile: ctx.readFile || ((f) => fs.readFileSync(f, "utf8")), exec: ctx.exec || (() => null) };
  const isWSL = ctx.isWSL ?? detectWSL(c);
  const P = platform === "win32" ? path.win32 : path.posix;
  const project = projectName || P.basename(projectRoot || cwd);
  const roots = {
    project: { base: P.join(projectRoot || cwd, "customer-explainers"), naming: "date-slug", label: "New folder in project" },
    cwd: { base: cwd, naming: "flat", sourcesBase: P.join(workspace, "runs"), label: "Current folder" },
  };

  let desktop = null;
  let videos = null;
  let videosLabel = "Videos folder";
  if (platform === "darwin") {
    desktop = P.join(home, "Desktop");
    videos = P.join(home, "Movies");
    videosLabel = "Movies folder";
  } else if (platform === "win32") {
    desktop = windowsKnownFolder("Desktop", c) || P.join(env.USERPROFILE || home, "Desktop");
    videos = windowsKnownFolder("MyVideos", c) || P.join(env.USERPROFILE || home, "Videos");
  } else if (isWSL) {
    desktop = wslWindowsFolder("Desktop", "Desktop", c) || xdgDir("DESKTOP", c) || P.join(home, "Desktop");
    videos = wslWindowsFolder("MyVideos", "Videos", c) || xdgDir("VIDEOS", c) || P.join(home, "Videos");
  } else {
    desktop = xdgDir("DESKTOP", c) || P.join(home, "Desktop");
    videos = xdgDir("VIDEOS", c) || P.join(home, "Videos");
  }
  roots.desktop = { base: desktop, naming: "project-date-slug", label: "Desktop", exists: existsFn(desktop) };
  roots.videos = { base: videos, naming: "project-date-slug", label: videosLabel, exists: existsFn(videos) };
  return { roots, isWSL, project };
}

/** Folder name for a run under a given naming scheme. */
export function folderName(naming, { project, date, slug }) {
  if (naming === "date-slug") return `${date}-${slug}`;
  if (naming === "project-date-slug") return `${slugify(project, 30)}-${date}-${slug}`;
  return slug;
}

/** First free name: base, base-2, base-3 ... */
export function uniquePath(dir, name, existsFn = (p) => fs.existsSync(p), P = path) {
  let candidate = P.join(dir, name);
  for (let i = 2; existsFn(candidate); i++) candidate = P.join(dir, `${name}-${i}`);
  return candidate;
}

/**
 * Where every deliverable of one run goes. "flat" (current folder) puts files straight into cwd with
 * slug-prefixed names so nothing existing is overwritten, and keeps sources in the tool workspace.
 */
export function planRun({
  choice,
  roots,
  project,
  date,
  title,
  customPath,
  home,
  env,
  existsFn = (p) => fs.existsSync(p),
  isEmptyDir = (p) => {
    try {
      return fs.readdirSync(p).filter((f) => !f.startsWith(".")).length === 0;
    } catch {
      return false;
    }
  },
  platform = process.platform,
}) {
  const P = platform === "win32" ? path.win32 : path.posix;
  let slug = slugify(title);
  if (choice === "cwd") {
    const base = roots.cwd.base;
    let s = slug;
    for (let i = 2; ["", ".mp4", "-message.md", "-images", "-diagrams"].some((x) => existsFn(P.join(base, s + x))); i++) s = `${slug}-${i}`;
    slug = s;
    const src = uniquePath(roots.cwd.sourcesBase, `${slugify(project, 30)}-${date}-${slug}`, existsFn, P);
    return {
      slug,
      folder: base,
      src: P.join(src, "_source"),
      layout: {
        video: `${slug}.mp4`,
        poster: `${slug}-poster.png`,
        gif: `${slug}-preview.gif`,
        images: `${slug}-images`,
        diagrams: `${slug}-diagrams`,
        message: `${slug}-message.md`,
      },
    };
  }
  let base;
  let naming;
  const layout = { video: `${slug}.mp4`, poster: `${slug}-poster.png`, gif: `${slug}-preview.gif`, images: "images", diagrams: "diagrams", message: "message.md" };
  if (choice === "path") {
    base = expandUserPath(customPath, { home, env, platform });
    if (!P.isAbsolute(base)) base = P.resolve(roots.cwd.base, base);
    // An empty or missing folder is used as is; a folder with content gets a fresh subfolder.
    if (!existsFn(base) || isEmptyDir(base)) return { slug, folder: base, src: P.join(base, "_source"), layout };
    naming = "project-date-slug";
  } else {
    const r = roots[choice];
    if (!r) throw new Error(`Unknown save option "${choice}"`);
    base = r.base;
    naming = r.naming;
  }
  const folder = uniquePath(base, folderName(naming, { project, date, slug }), existsFn, P);
  return { slug, folder, src: P.join(folder, "_source"), layout };
}
