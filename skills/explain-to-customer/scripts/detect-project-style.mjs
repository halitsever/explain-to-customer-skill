#!/usr/bin/env node
/**
 * Build a style JSON from the project itself ("Match my project"), a website URL, or brand hex colours.
 *   detect-project-style.mjs --project <root> --src <folder>/_source [--base shadcn] [--no-install-fonts]
 *   detect-project-style.mjs --url https://example.com --src <...>
 *   detect-project-style.mjs --colors "#4F46E5,#F59E0B" --src <...> [--mode light|dark]
 * Writes _source/style.json and _source/style-detection.json; prints what was detected and what was guessed.
 */
import fs from "node:fs";
import path from "node:path";
import { parseArgs, SKILL_DIR, readJson, writeJson, exists, die, log, launchChromium, runSync } from "./lib/common.mjs";
import { initColor, toHex, contrast, mix } from "./lib/color.mjs";
import { isInstalled, fontsourceId } from "./lib/fonts.mjs";

const args = parseArgs();
const SKIP = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "out",
  "coverage",
  "vendor",
  ".turbo",
  ".cache",
  ".svelte-kit",
  ".nuxt",
  ".output",
  "customer-explainers",
  "storybook-static",
  "public/build",
  "target",
  ".venv",
  "venv",
]);
const detected = {};
const guessed = [];
const notes = [];
const record = (token, value, source) => {
  if (value && !detected[token]) detected[token] = { value, source };
};

function walk(root, maxDepth = 6) {
  const out = [];
  const visit = (dir, depth) => {
    if (depth > maxDepth || out.length > 4000) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (SKIP.has(e.name) || (e.name.startsWith(".") && e.name !== ".storybook")) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) visit(p, depth + 1);
      else out.push(p);
    }
  };
  visit(root, 0);
  return out;
}
const read = (f) => {
  try {
    const st = fs.statSync(f);
    return st.size < 600_000 ? fs.readFileSync(f, "utf8") : "";
  } catch {
    return "";
  }
};
const rel = (root, f) => path.relative(root, f);

/** Normalise raw CSS colour syntax (incl. shadcn v3 bare HSL triplets) to hex; null when unusable. */
function hexOf(raw, vars = {}) {
  if (!raw) return null;
  let v = String(raw)
    .trim()
    .replace(/\s*!important$/, "");
  for (let i = 0; i < 4; i++) {
    const m = v.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)$/);
    if (!m) break;
    v = vars[m[1]] ?? m[2] ?? "";
  }
  if (/^\d+(\.\d+)?\s+\d+(\.\d+)?%\s+\d+(\.\d+)?%(\s*\/\s*[\d.]+%?)?$/.test(v)) v = `hsl(${v})`;
  if (/^\d+(\.\d+)?%?\s+[\d.]+\s+[\d.]+$/.test(v) && /^\d/.test(v)) v = `oklch(${v})`;
  try {
    return toHex(v);
  } catch {
    return null;
  }
}

const VAR_MAP = {
  background: ["--background", "--color-background", "--bg", "--color-bg", "--body-bg", "--bg-color"],
  foreground: ["--foreground", "--color-foreground", "--fg", "--text", "--color-text", "--text-color", "--body-color"],
  surface: ["--card", "--color-card", "--surface", "--color-surface", "--popover"],
  muted: ["--muted", "--color-muted", "--secondary", "--color-secondary"],
  mutedForeground: ["--muted-foreground", "--color-muted-foreground", "--text-muted", "--text-secondary", "--color-text-muted"],
  border: ["--border", "--color-border", "--input", "--border-color"],
  primary: ["--primary", "--color-primary", "--brand", "--color-brand", "--brand-color", "--primary-color"],
  primaryForeground: ["--primary-foreground", "--color-primary-foreground", "--on-primary"],
  accent: ["--accent", "--color-accent", "--ring", "--color-ring"],
  danger: ["--destructive", "--color-destructive", "--danger", "--error", "--color-error", "--color-danger"],
  success: ["--success", "--color-success"],
  warning: ["--warning", "--color-warning"],
};

function cssBlocks(text) {
  const blocks = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(text))) blocks.push({ selector: m[1].trim(), body: m[2] });
  return blocks;
}

function scanCss(root, files) {
  const light = {};
  const dark = {};
  const fontVars = {};
  let colorScheme = null;
  for (const f of files.filter((x) => /\.(css|scss|sass|less|pcss)$/.test(x))) {
    const text = read(f);
    if (!/--[\w-]+\s*:/.test(text) && !/\$[\w-]+\s*:/.test(text) && !/font-family/.test(text)) continue;
    for (const b of cssBlocks(text.replace(/\/\*[\s\S]*?\*\//g, ""))) {
      const isDark = /\.dark\b|\[data-theme=["']?dark|data-mode=["']?dark/.test(b.selector);
      const isRoot = /:root|^html\b|@theme|^\s*\}?\s*@theme|^body\b|\[data-theme=["']?light/.test(b.selector) || b.selector.endsWith("@theme") || b.selector.includes("@theme");
      if (!isDark && !isRoot) {
        if (/^(body|html)\b/.test(b.selector)) {
          const ff = b.body.match(/font-family:\s*([^;]+);/);
          if (ff) fontVars["body-font-family"] ??= { value: ff[1], source: rel(root, f) };
        }
        continue;
      }
      const target = isDark ? dark : light;
      for (const [, name, value] of b.body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
        target[name] ??= { value: value.trim(), source: rel(root, f) };
        if (/^--font-(sans|body|heading|display|mono|serif)$/.test(name)) fontVars[name] ??= { value: value.trim(), source: rel(root, f) };
      }
      const cs = b.body.match(/color-scheme:\s*(dark|light)/);
      if (cs && !isDark) colorScheme = cs[1];
      const ff = b.body.match(/font-family:\s*([^;]+);/);
      if (ff && /^(html|body|:root)/.test(b.selector)) fontVars["body-font-family"] ??= { value: ff[1], source: rel(root, f) };
    }
    for (const [, name, value] of text.matchAll(/\$([\w-]+)\s*:\s*([^;]+);/g)) {
      const n = `--${name}`;
      light[n] ??= { value: value.trim(), source: `${rel(root, f)} (SCSS)` };
    }
  }
  return { light, dark, fontVars, colorScheme };
}

function mapVars(vars, target) {
  const flat = Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, v.value]));
  const out = {};
  for (const [token, names] of Object.entries(VAR_MAP)) {
    for (const n of names) {
      if (!vars[n]) continue;
      const hex = hexOf(vars[n].value, flat);
      if (hex) {
        out[token] = { value: hex, source: `${vars[n].source} ${n}` };
        break;
      }
    }
  }
  if (target) Object.entries(out).forEach(([k, v]) => record(k, v.value, v.source));
  const radius = vars["--radius"] || vars["--radius-md"] || vars["--border-radius"];
  return { colors: out, radius: radius ? { value: radius.value, source: radius.source } : null };
}

function scanTailwindConfig(root, files) {
  const f = files.find((x) => /tailwind\.config\.(js|cjs|mjs|ts)$/.test(x));
  if (!f) return {};
  const t = read(f);
  const out = {};
  for (const key of ["primary", "brand", "accent", "secondary", "background", "foreground"]) {
    const m = t.match(new RegExp(`['"]?${key}['"]?\\s*:\\s*(?:\\{[^}]*DEFAULT\\s*:\\s*)?['"](#[0-9a-fA-F]{3,8})['"]`));
    if (m) out[key] = { value: toHex(m[1]), source: `${rel(root, f)} colors.${key}` };
  }
  const fonts = {};
  for (const key of ["sans", "display", "heading", "body", "mono"]) {
    const m = t.match(new RegExp(`${key}\\s*:\\s*\\[\\s*['"]([^'"]+)['"]`));
    if (m) fonts[key] = { value: m[1], source: `${rel(root, f)} fontFamily.${key}` };
  }
  return { colors: out, fonts };
}

function scanThemeFiles(root, files) {
  const out = {};
  for (const f of files.filter((x) => /\.(t|j)sx?$|\.mjs$/.test(x))) {
    const t = read(f);
    if (!/createTheme|extendTheme|MantineProvider|createStitches|defineConfig\(\{[\s\S]*theme/.test(t)) continue;
    const m = t.match(/primary\s*:\s*\{\s*main\s*:\s*['"](#[0-9a-fA-F]{3,8})['"]/) || t.match(/brand\s*:\s*\{[^}]*?(?:500|600)\s*:\s*['"](#[0-9a-fA-F]{3,8})['"]/);
    if (m) out.primary = { value: toHex(m[1]), source: rel(root, f) };
    const s = t.match(/secondary\s*:\s*\{\s*main\s*:\s*['"](#[0-9a-fA-F]{3,8})['"]/);
    if (s) out.accent = { value: toHex(s[1]), source: rel(root, f) };
    const bg = t.match(/background\s*:\s*\{\s*default\s*:\s*['"](#[0-9a-fA-F]{3,8})['"]/);
    if (bg) out.background = { value: toHex(bg[1]), source: rel(root, f) };
    const font = t.match(/fontFamily\s*:\s*['"`]\s*["']?([A-Za-z0-9 ]+)["']?/);
    if (font) out.font = { value: font[1].trim(), source: rel(root, f) };
    if (Object.keys(out).length) break;
  }
  return out;
}

function scanTokenJson(root, files) {
  const out = {};
  for (const f of files.filter((x) => /(^|[/\\])(design-)?tokens?(\.[\w-]+)?\.json$|\.tokens\.json$/.test(x))) {
    const data = readJson(f, null);
    if (!data) continue;
    const visit = (o, trail) => {
      if (!o || typeof o !== "object") return;
      const val = o.$value ?? o.value;
      if (typeof val === "string" && /^#|rgb|hsl|oklch/.test(val)) {
        const key = trail.join(".").toLowerCase();
        const token = /primary|brand/.test(key)
          ? "primary"
          : /background|canvas|bg\b/.test(key)
            ? "background"
            : /foreground|text\.default|text-primary|fg\b/.test(key)
              ? "foreground"
              : /border/.test(key)
                ? "border"
                : /accent|secondary/.test(key)
                  ? "accent"
                  : null;
        const hex = hexOf(val);
        if (token && hex && !out[token]) out[token] = { value: hex, source: `${rel(root, f)} ${trail.join(".")}` };
      }
      for (const [k, v] of Object.entries(o)) if (!k.startsWith("$")) visit(v, [...trail, k]);
    };
    visit(data, []);
  }
  return out;
}

function scanDesignDoc(root, files) {
  const out = {};
  for (const f of files.filter((x) => /(^|[/\\])(DESIGN|frame|BRAND|STYLEGUIDE)\.md$/i.test(x))) {
    for (const line of read(f).split("\n")) {
      const m = line.match(/(primary|brand|accent|background|foreground|text|border)[^#\n]{0,40}(#[0-9a-fA-F]{6})\b/i);
      if (!m) continue;
      const token = { brand: "primary", text: "foreground" }[m[1].toLowerCase()] || m[1].toLowerCase();
      if (!out[token]) out[token] = { value: toHex(m[2]), source: `${rel(root, f)}` };
    }
  }
  return out;
}

function scanFonts(root, files, css, tw, theme) {
  const found = {};
  const set = (role, value, source) => {
    if (value && !found[role]) found[role] = { value: value.replace(/['"]/g, "").split(",")[0].trim(), source };
  };
  for (const f of files.filter((x) => /\.(t|j)sx?$|\.mjs$/.test(x))) {
    const t = read(f);
    const nf = t.match(/import\s*\{([^}]+)\}\s*from\s*['"]next\/font\/google['"]/);
    if (nf) {
      const names = nf[1]
        .split(",")
        .map((s) =>
          s
            .trim()
            .split(/\s+as\s+/)[0]
            .replace(/_/g, " "),
        )
        .filter(Boolean);
      const mono = names.find((n) => /mono/i.test(n));
      const sans = names.filter((n) => !/mono/i.test(n));
      set("body", sans[0], `${rel(root, f)} (next/font)`);
      if (sans[1]) set("heading", sans[1], `${rel(root, f)} (next/font)`);
      if (mono) set("mono", mono, `${rel(root, f)} (next/font)`);
    }
    if (/from\s*['"]geist\/font/.test(t)) {
      set("body", "Geist", `${rel(root, f)} (geist package)`);
      if (/GeistMono/.test(t)) set("mono", "Geist Mono", `${rel(root, f)} (geist package)`);
    }
  }
  for (const f of files.filter((x) => /\.(html|tsx|jsx|vue|svelte|astro|css)$/.test(x))) {
    const t = read(f);
    for (const m of t.matchAll(/fonts\.googleapis\.com\/css2?\?family=([^"'&)]+)/g)) {
      const fams = decodeURIComponent(m[1])
        .split("&family=")
        .map((s) => s.split(":")[0].replace(/\+/g, " "));
      for (const fam of fams) set(/mono/i.test(fam) ? "mono" : "body", fam, `${rel(root, f)} (Google Fonts link)`);
    }
  }
  const fv = css.fontVars;
  set("heading", fv["--font-heading"]?.value || fv["--font-display"]?.value, fv["--font-heading"]?.source || fv["--font-display"]?.source);
  set("body", fv["--font-sans"]?.value || fv["--font-body"]?.value, fv["--font-sans"]?.source || fv["--font-body"]?.source);
  set("mono", fv["--font-mono"]?.value, fv["--font-mono"]?.source);
  set("body", fv["body-font-family"]?.value, fv["body-font-family"]?.source);
  set("heading", tw.fonts?.display?.value || tw.fonts?.heading?.value, tw.fonts?.display?.source || tw.fonts?.heading?.source);
  set("body", tw.fonts?.sans?.value || tw.fonts?.body?.value, tw.fonts?.sans?.source);
  set("mono", tw.fonts?.mono?.value, tw.fonts?.mono?.source);
  set("body", theme.font?.value, theme.font?.source);
  for (const k of Object.keys(found)) {
    if (/^var\(|^ui-|^system-ui|^-apple-system|^sans-serif|^serif|^monospace/.test(found[k].value)) delete found[k];
  }
  return found;
}

function detectMode(root, files, css) {
  for (const f of files.filter((x) => /(layout|_document|_app|index|App|root)\.(t|j)sx?$|index\.html$|app\.html$/.test(x))) {
    const t = read(f);
    if (/defaultTheme=["']dark|<html[^>]*class(Name)?=["'][^"']*\bdark\b/.test(t)) return { value: "dark", source: rel(root, f) };
  }
  if (css.colorScheme) return { value: css.colorScheme, source: "CSS color-scheme" };
  return null;
}

function findLogo(root, files) {
  const score = (f) => {
    const r = rel(root, f).toLowerCase();
    if (!/\.(svg|png|webp)$/.test(r)) return -1;
    if (/node_modules|test|fixture|screenshot|example/.test(r)) return -1;
    let s = 0;
    if (/(^|\/)logo[\w-]*\.(svg|png|webp)$/.test(r)) s += 10;
    else if (/logo/.test(r)) s += 6;
    else if (/(^|\/)(icon|favicon|apple-touch-icon)[\w-]*\.(svg|png)$/.test(r)) s += 3;
    else return -1;
    if (r.endsWith(".svg")) s += 2;
    if (/^(public|static|assets|src\/assets|app)\//.test(r) || !r.includes("/")) s += 2;
    return s;
  };
  return (
    files
      .map((f) => [score(f), f])
      .filter(([s]) => s > 0)
      .sort((a, b) => b[0] - a[0])[0]?.[1] || null
  );
}

function ensureFont(family) {
  if (!family || isInstalled(family)) return { family, installed: true };
  if (args["install-fonts"] === false) return { family, installed: false };
  const id = fontsourceId(family);
  log(`  installing @fontsource/${id} into the tool workspace …`);
  const r = runSync(process.execPath, [path.join(SKILL_DIR, "scripts", "setup.mjs"), "--add-font", family], { timeout: 180000 });
  return { family, installed: r.code === 0 && isInstalled(family) };
}

/** Fill everything not detected from a base catalog style, tinted toward the detected primary hue. */
function compose(base, found, { id, name, family, mode, description }) {
  const colors = { ...base.colors };
  const darkBase = base.darkColors || {};
  const isDark = mode === "dark";
  const src = isDark ? { ...colors, ...darkBase } : colors;
  const out = { ...src };
  for (const [k, v] of Object.entries(found)) if (k in out) out[k] = v.value;
  const primary = out.primary;
  const neutralKeys = ["muted", "mutedForeground", "border", "surface", "foreground", "background"];
  for (const k of neutralKeys) {
    if (found[k]) continue;
    // Gently tint neutrals toward the brand so guessed greys do not clash with it.
    out[k] = mix(src[k], primary, k === "background" || k === "surface" ? 0.015 : 0.06);
    guessed.push(k);
  }
  if (!found.accent || contrast(found.accent.value, out.background) < 1.6) {
    out.accent = primary;
    if (!found.accent) guessed.push("accent");
  }
  for (const k of ["primaryForeground", "success", "warning", "danger"]) if (!found[k]) guessed.push(k);
  const style = {
    id,
    name,
    family,
    defaultMode: mode,
    description,
    bestFor: "This project: its own colours, fonts, radius and logo.",
    colors: out,
    fonts: base.fonts,
    typography: base.typography,
    radius: base.radius,
    borderWidth: base.borderWidth,
    shadow: base.shadow,
    effects: [],
    motion: base.motion,
    mermaid: { look: base.mermaid.look, themeVariables: {} },
    signature: [],
    avoid: ["Colours or fonts that are not in the project"],
  };
  return style;
}

async function fromUrl(url) {
  const browser = await launchChromium();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(url, { waitUntil: "networkidle", timeout: 45000 }).catch(() => page.goto(url, { waitUntil: "load", timeout: 45000 }));
    return await page.evaluate(() => {
      const cs = (el) => (el ? getComputedStyle(el) : null);
      const solid = (c) => (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c) ? c : null);
      const body = document.body;
      const bg = solid(cs(body).backgroundColor) || solid(cs(document.documentElement).backgroundColor) || "rgb(255, 255, 255)";
      const h = document.querySelector("h1") || document.querySelector("h2");
      const btn = [...document.querySelectorAll('button, a[class*="btn"], a[class*="button"], [role="button"], input[type="submit"]')].find((b) => {
        const s = cs(b);
        return solid(s.backgroundColor) && s.backgroundColor !== bg && b.offsetWidth > 40;
      });
      const link = [...document.querySelectorAll("main a, a")].find((a) => a.offsetWidth > 0);
      const input = document.querySelector("input:not([type=hidden]), textarea");
      const first = (ff) => (ff || "").split(",")[0].replace(/["']/g, "").trim();
      return {
        background: bg,
        foreground: cs(body).color,
        headingFont: first(cs(h)?.fontFamily),
        bodyFont: first(cs(body).fontFamily),
        headingWeight: cs(h)?.fontWeight,
        primary: btn ? cs(btn).backgroundColor : null,
        primaryForeground: btn ? cs(btn).color : null,
        radius: btn ? cs(btn).borderRadius : null,
        link: link ? cs(link).color : null,
        border: input ? cs(input).borderColor : null,
      };
    });
  } finally {
    await browser.close();
  }
}

async function main() {
  const src = args.src ? path.resolve(args.src) : die("Missing --src <folder>/_source");
  await initColor();
  const base = readJson(path.join(SKILL_DIR, "styles", `${args.base || "shadcn"}.json`));
  let style;
  let fonts = {};
  let logoFile = null;

  if (args.colors) {
    const list = String(args.colors)
      .split(/[,\s]+/)
      .filter(Boolean)
      .map((c) => toHex(c));
    if (!list.length) die("No usable colours in --colors");
    record("primary", list[0], "--colors");
    if (list[1]) record("accent", list[1], "--colors");
    const mode = args.mode || "light";
    style = compose(base, detected, { id: "custom", name: "Brand colours", family: "Custom", mode, description: `Palette built around ${list.join(", ")} with AA contrast.` });
    if (list[2]) style.palette = list.slice(1, 6);
  } else if (args.url) {
    const d = await fromUrl(args.url);
    const put = (token, raw, label) => {
      const h = hexOf(raw);
      if (h) record(token, h, `${args.url} ${label}`);
    };
    put("background", d.background, "body background");
    put("foreground", d.foreground, "body text");
    put("primary", d.primary || d.link, d.primary ? "button background" : "link colour");
    put("primaryForeground", d.primaryForeground, "button text");
    if (d.link && d.primary) put("accent", d.link, "link colour");
    put("border", d.border, "input border");
    const bgHex = detected.background?.value || "#FFFFFF";
    const mode = args.mode || (contrast(bgHex, "#000000") < contrast(bgHex, "#FFFFFF") ? "dark" : "light");
    let host = args.url;
    try {
      host = new URL(args.url).hostname;
    } catch {
      /* keep raw */
    }
    style = compose(base, detected, { id: "custom", name: `${host} (matched)`, family: "Custom", mode, description: `Colours and fonts read from ${host}.` });
    if (d.radius && /px/.test(d.radius)) {
      style.radius = `${Math.min(40, parseFloat(d.radius))}px`;
      record("radius", style.radius, "button border-radius");
    }
    fonts = { heading: d.headingFont ? { value: d.headingFont, source: "h1 computed font" } : null, body: d.bodyFont ? { value: d.bodyFont, source: "body computed font" } : null };
    notes.push("Logos are never downloaded from a URL; add one from the project repo if needed.");
  } else {
    const root = path.resolve(args.project || process.cwd());
    const files = walk(root);
    const comps = files.find((f) => /(^|[/\\])components\.json$/.test(f));
    if (comps) notes.push(`shadcn/ui config found (${rel(root, comps)})`);
    const css = scanCss(root, files);
    const lightMap = mapVars(css.light, true);
    const darkMap = mapVars(css.dark, false);
    const tw = scanTailwindConfig(root, files);
    for (const [k, v] of Object.entries(tw.colors || {})) record(k === "brand" ? "primary" : k === "secondary" ? "accent" : k, v.value, v.source);
    const theme = scanThemeFiles(root, files);
    for (const k of ["primary", "accent", "background"]) if (theme[k]) record(k, theme[k].value, theme[k].source);
    for (const [k, v] of Object.entries(scanTokenJson(root, files))) record(k, v.value, v.source);
    for (const [k, v] of Object.entries(scanDesignDoc(root, files))) record(k, v.value, v.source);
    fonts = scanFonts(root, files, css, tw, theme);
    const modeFound = detectMode(root, files, css);
    let mode = args.mode || modeFound?.value;
    if (!mode) {
      const bg = detected.background?.value;
      mode = bg && contrast(bg, "#000000") < contrast(bg, "#FFFFFF") ? "dark" : "light";
      if (!detected.background) guessed.push("mode");
    }
    if (!Object.keys(detected).length) {
      notes.push("No usable colours found in the project; using the shadcn style unchanged.");
      style = { ...base, id: "project", family: "Project", name: "Project (fallback: shadcn)", description: "Nothing usable was detected, so this is the shadcn style." };
    } else {
      const pkg = readJson(path.join(root, "package.json"), {});
      const pname = pkg.productName || pkg.name || path.basename(root);
      style = compose(base, detected, {
        id: "project",
        name: `${pname} (detected)`,
        family: "Project",
        mode,
        description: `Detected from ${path.basename(root)}: its own colours, fonts and radius.`,
      });
      const darkColors = Object.fromEntries(Object.entries(darkMap.colors).map(([k, v]) => [k, v.value]));
      if (Object.keys(darkColors).length && mode === "light") style.darkColors = darkColors;
      if (lightMap.radius) {
        const r = lightMap.radius.value;
        const px = /rem$/.test(r) ? parseFloat(r) * 16 : parseFloat(r);
        if (Number.isFinite(px)) {
          style.radius = `${Math.round(px)}px`;
          record("radius", style.radius, lightMap.radius.source);
        }
      } else guessed.push("radius");
    }
    logoFile = findLogo(root, files);
  }

  // Fonts: use what was found when an open package exists for it, else keep the base font and say so.
  const fontOut = { ...style.fonts };
  for (const [role, info] of Object.entries(fonts || {})) {
    if (!info) continue;
    const r = ensureFont(info.value);
    if (r.installed) {
      if (role === "body") {
        fontOut.body = info.value;
        if (!fonts.heading) fontOut.heading = info.value;
      }
      if (role === "heading") fontOut.heading = info.value;
      if (role === "mono") fontOut.mono = info.value;
      record(`font.${role}`, info.value, info.source);
    } else notes.push(`Font "${info.value}" (${info.source}) has no open package; using ${fontOut[role] || fontOut.body} instead.`);
  }
  if (!fonts?.body) guessed.push("fonts");
  fontOut.packages = [...new Set([fontOut.heading, fontOut.body, fontOut.mono].map((f) => `@fontsource/${fontsourceId(f)}`))];
  style.fonts = fontOut;

  if (logoFile) {
    const dest = path.join(src, "brand", `logo${path.extname(logoFile)}`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(logoFile, dest);
    style.logo = `brand/logo${path.extname(logoFile)}`;
    record("logo", path.basename(logoFile), logoFile);
  }
  style.signature = [
    `Primary ${style.colors.primary}${detected.primary ? "" : " (guessed)"}`,
    `${style.fonts.heading} headings, ${style.fonts.body} body`,
    `${style.radius} radius, ${style.defaultMode} mode`,
  ];
  style.detection = { detected, guessed: [...new Set(guessed)], notes };
  writeJson(path.join(src, "style.json"), style);
  writeJson(path.join(src, "style-detection.json"), style.detection);
  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        styleFile: path.join(src, "style.json"),
        mode: style.defaultMode,
        colors: style.colors,
        fonts: style.fonts,
        radius: style.radius,
        logo: style.logo || null,
        detected,
        guessed: [...new Set(guessed)],
        notes,
      },
      null,
      2,
    ) + "\n",
  );
}

main().catch((e) => die(e.stack || e.message));
