#!/usr/bin/env node
/**
 * Style JSON -> tokens.css, tokens.json, mermaid-config.json and a local font bundle (fonts/fonts.css, fonts/mermaid.css).
 *   theme.mjs --style <id|name|path.json> --src <folder>/_source [--mode light|dark] [--variant amber] [--lang tr]
 *   theme.mjs --list | --resolve "<query>" | --validate [file.json ...]
 */
import fs from "node:fs";
import path from "node:path";
import { parseArgs, SKILL_DIR, WS, readJson, writeJson, exists, mkdirp, die, log, importTool, resolveTool } from "./lib/common.mjs";
import { initColor, toHex, composite, contrast, ensureContrast, bestText, mix, alphaOf } from "./lib/color.mjs";
import { writeFontBundle, stackFor } from "./lib/fonts.mjs";

const STYLES_DIR = path.join(SKILL_DIR, "styles");
const args = parseArgs();

export function catalog() {
  return fs
    .readdirSync(STYLES_DIR)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => readJson(path.join(STYLES_DIR, f)));
}

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]/g, "");
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  return d[a.length][b.length];
}

/** Fuzzy catalog lookup on id, name and inspiredBy. */
export function resolveStyle(query) {
  const q = norm(query);
  let best = null;
  for (const s of catalog()) {
    for (const key of [s.id, s.name, s.inspiredBy].filter(Boolean)) {
      const k = norm(key);
      let score = 0;
      if (k === q) score = 100;
      else if (k.startsWith(q) || q.startsWith(k)) score = 80;
      else if (k.includes(q) || q.includes(k)) score = 70;
      else if (lev(k, q) <= Math.max(1, Math.floor(k.length / 4))) score = 60;
      if (score && (!best || score > best.score)) best = { score, style: s };
    }
  }
  return best;
}

function loadStyle(arg) {
  if (!arg) die("Missing --style");
  if (exists(arg) && fs.statSync(arg).isFile()) return readJson(arg);
  const hit = resolveStyle(arg);
  if (!hit)
    die(
      `No style matches "${arg}". Known: ${catalog()
        .map((s) => s.id)
        .join(", ")}`,
    );
  return hit.style;
}

async function validate(files) {
  const { default: Ajv } = await importTool("ajv");
  const ajv = new Ajv({ allErrors: true, strict: false });
  const check = ajv.compile(readJson(path.join(STYLES_DIR, "_schema.json")));
  const list = files.length
    ? files
    : fs
        .readdirSync(STYLES_DIR)
        .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
        .map((f) => path.join(STYLES_DIR, f));
  await initColor();
  const results = [];
  for (const f of list) {
    const data = readJson(f);
    const ok = check(data);
    const errors = ok ? [] : check.errors.map((e) => `${e.instancePath || "/"} ${e.message}`);
    for (const [k, v] of Object.entries(data.colors || {})) {
      try {
        toHex(v);
      } catch {
        errors.push(`/colors/${k} unparseable: ${v}`);
      }
    }
    if (path.dirname(path.resolve(f)) === STYLES_DIR && path.basename(f, ".json") !== data.id) errors.push(`file name does not match id "${data.id}"`);
    results.push({ file: path.basename(f), ok: errors.length === 0, errors });
  }
  return results;
}

function mermaidSupportsNeo() {
  try {
    const dir = path.dirname(resolveTool("mermaid", "package.json"));
    const min = path.join(dir, "dist", "mermaid.min.js");
    return exists(min) && fs.readFileSync(min, "utf8").includes('look:"neo"');
  } catch {
    return false;
  }
}

const WEIGHTS = { heading: [600, 700, 800], body: [400, 500, 600, 700], mono: [400, 600] };

const LANG_SAMPLE = {
  tr: "İıĞğŞşÇçÖöÜü",
  de: "ÄäÖöÜüß",
  fr: "ÀâçéèêëîïôûùüÿœŒ",
  es: "ÁáÉéÍíÑñÓóÚúü¿¡",
  pl: "ĄąĆćĘęŁłŃńÓóŚśŹźŻż",
  cs: "ČčĎďĚěŇňŘřŠšŤťŮůŽž",
  ro: "ĂăÂâÎîȘșȚț",
  hu: "ŐőŰűÁáÉé",
  pt: "ÃãÕõÇçÁáÉéÍíÓóÚú",
  it: "ÀàÈèÉéÌìÒòÙù",
  nl: "ËëÏïÉé",
  ru: "АБВГДЕЁЖЗИЙабвгдеёжзий",
  el: "ΑΒΓΔΕαβγδε",
  vi: "ĂăÂâĐđÊêÔôƠơƯư",
};

/** Which letters of the run's language each bundled family lacks, read from the woff2 files themselves. */
async function glyphCoverage(fontsDir, lang) {
  const sample = LANG_SAMPLE[String(lang || "tr").slice(0, 2)] || LANG_SAMPLE.tr;
  let fontkit;
  try {
    fontkit = await importTool("fontkit");
  } catch {
    return null;
  }
  const css = fs.readFileSync(path.join(fontsDir, "fonts.css"), "utf8");
  const byFamily = new Map();
  for (const [, fam, file] of css.matchAll(/font-family:"([^"]+)"[^}]*?src:url\("\.\/([^"]+)"\)/g)) {
    if (!byFamily.has(fam)) byFamily.set(fam, new Set());
    byFamily.get(fam).add(file);
  }
  const out = {};
  for (const [fam, files] of byFamily) {
    const covered = new Set();
    for (const f of files) {
      try {
        const font = fontkit.create(fs.readFileSync(path.join(fontsDir, f)));
        for (const ch of sample) if (font.hasGlyphForCodePoint(ch.codePointAt(0))) covered.add(ch);
      } catch {
        /* unreadable file, reported as missing letters */
      }
    }
    const missing = [...sample].filter((c) => !covered.has(c)).join("");
    out[fam] = missing ? `missing ${missing}` : `all of ${sample}`;
  }
  return out;
}

async function build() {
  const src = args.src ? path.resolve(args.src) : die("Missing --src <folder>/_source");
  await initColor();
  const style = structuredClone(loadStyle(args.style));
  const mode = args.mode || style.defaultMode;
  let colors = { ...style.colors };
  if (mode !== style.defaultMode) {
    const alt = mode === "light" ? style.lightColors : style.darkColors;
    if (alt) colors = { ...colors, ...alt };
    else log(`! ${style.id} has no ${mode} variant; using ${style.defaultMode}.`);
  }
  let palette = style.palette ? [...style.palette] : [];
  if (args.variant) {
    const v = style.variants?.[args.variant];
    if (!v) die(`Style ${style.id} has no variant "${args.variant}". Variants: ${Object.keys(style.variants || {}).join(", ") || "none"}`);
    colors = { ...colors, ...(v.colors || {}) };
    if (v.palette) palette = v.palette;
  }

  const adjustments = [];
  const note = (token, r, against, min) => {
    if (r.changed) adjustments.push({ token, from: r.fromHex, to: r.hex, before: +r.before.toFixed(2), after: +r.after.toFixed(2), against, min });
  };
  const fix = (token, value, bgs, min, against) => {
    const r = ensureContrast(value, bgs, min);
    r.fromHex = toHex(value);
    note(token, r, against, min);
    return r.hex;
  };

  // Effective backgrounds: gradient stops under the optional scrim, else the flat background.
  const bg = style.background || {};
  const rawStops = bg.gradient?.length ? bg.gradient : [colors.background];
  const stops = rawStops.map((s) => (bg.overlay ? composite(bg.overlay, toHex(s)) : toHex(s)));
  const bgHex = stops.length > 1 ? mix(stops[0], stops[stops.length - 1], 0.5) : stops[0];
  const surfaces = stops.map((s) => (alphaOf(colors.surface) < 1 ? composite(colors.surface, s) : toHex(colors.surface)));
  const surfaceHex = surfaces.length > 1 ? mix(surfaces[0], surfaces[surfaces.length - 1], 0.5) : surfaces[0];
  const mutedHex = alphaOf(colors.muted) < 1 ? composite(colors.muted, bgHex) : toHex(colors.muted);
  const borderHex = alphaOf(colors.border) < 1 ? composite(colors.border, surfaceHex) : toHex(colors.border);
  const readOn = [...stops, ...surfaces];

  const fg = fix("foreground", colors.foreground, readOn, 4.5, "background + surface");
  const mutedFg = fix("mutedForeground", colors.mutedForeground, [...readOn, mutedHex], 4.5, "background + surface + muted");

  const solid = (key) => (alphaOf(colors[key]) < 1 ? composite(colors[key], bgHex) : toHex(colors[key]));
  let primary = solid("primary");
  let primaryFg = bestText(primary, [colors.primaryForeground, "#FFFFFF", "#000000", fg]);
  if (toHex(colors.primaryForeground) !== primaryFg.hex && contrast(colors.primaryForeground, primary) < 4.5) {
    adjustments.push({
      token: "primaryForeground",
      from: toHex(colors.primaryForeground),
      to: primaryFg.hex,
      before: +contrast(colors.primaryForeground, primary).toFixed(2),
      after: +primaryFg.ratio.toFixed(2),
      against: "primary",
      min: 4.5,
    });
  } else primaryFg = { hex: toHex(colors.primaryForeground), ratio: contrast(colors.primaryForeground, primary) };
  if (primaryFg.ratio < 4.5) primary = fix("primary", primary, [primaryFg.hex], 4.5, "primaryForeground");

  // Accent marks callouts and highlights: 3:1 against the canvas (WCAG non-text and large text).
  const accent = fix("accent", solid("accent"), [...stops, ...surfaces], 3, "background + surface");
  const onFill = (fill) => bestText(fill, [fg, "#000000", "#FFFFFF"]).hex;
  const status = {};
  for (const k of ["success", "warning", "danger"]) {
    const v = solid(k);
    status[k] = v;
    status[`${k}Fg`] = onFill(v);
  }
  const fills = palette.map((p, i) => {
    const hex = alphaOf(p) < 1 ? composite(p, bgHex) : toHex(p);
    const text = bestText(hex, [fg, "#000000", "#FFFFFF"]);
    if (text.ratio < 4.5) return { hex: fix(`palette[${i}]`, hex, [text.hex], 4.5, "text on fill"), fg: text.hex };
    return { hex, fg: text.hex };
  });

  // Fonts
  const fontSpecs = [
    { family: style.fonts.heading, weights: style.typography?.headingWeight ? [style.typography.headingWeight] : WEIGHTS.heading },
    { family: style.fonts.body, weights: style.typography?.bodyWeight ? [style.typography.bodyWeight, 700] : WEIGHTS.body },
    { family: style.fonts.mono, weights: WEIGHTS.mono },
  ];
  if (style.mermaid?.fontFamily) fontSpecs.push({ family: style.mermaid.fontFamily, weights: [400, 700] });
  const fontsDir = path.join(src, "fonts");
  fs.rmSync(fontsDir, { recursive: true, force: true });
  const bundle = writeFontBundle(fontsDir, fontSpecs, args.lang || readJson(path.join(src, "run.json"), {}).lang);
  const used = (fam) => bundle.resolved.find((r) => r.requested === fam)?.used || "Inter";
  const glyphs = await glyphCoverage(fontsDir, args.lang || readJson(path.join(src, "run.json"), {}).lang);
  const stacks = { heading: stackFor(used(style.fonts.heading)), body: stackFor(used(style.fonts.body)), mono: stackFor(used(style.fonts.mono)) };
  const mermaidFont = stackFor(used(style.mermaid?.fontFamily || style.fonts.body));

  const t = style.typography || {};
  const m = style.motion;
  const effects = style.effects || [];
  const vars = {
    "--bg": bgHex,
    "--bg-image": bg.gradient?.length ? `linear-gradient(${bg.angle ?? 135}deg, ${stops.join(", ")})` : "none",
    "--surface": colors.surface,
    "--surface-solid": surfaceHex,
    "--fg": fg,
    "--muted": colors.muted,
    "--muted-solid": mutedHex,
    "--muted-fg": mutedFg,
    "--border": colors.border,
    "--border-solid": borderHex,
    "--primary": primary,
    "--primary-fg": primaryFg.hex,
    "--accent": accent,
    "--accent-fg": onFill(accent),
    "--success": status.success,
    "--success-fg": status.successFg,
    "--warning": status.warning,
    "--warning-fg": status.warningFg,
    "--danger": status.danger,
    "--danger-fg": status.dangerFg,
    "--font-heading": stacks.heading,
    "--font-body": stacks.body,
    "--font-mono": stacks.mono,
    "--heading-weight": String(t.headingWeight ?? 700),
    "--body-weight": String(t.bodyWeight ?? 400),
    "--heading-tracking": t.headingTracking ?? "-0.02em",
    "--heading-case": t.headingCase ?? "none",
    "--type-scale": String(t.scale ?? 1),
    "--radius": style.radius,
    "--border-width": style.borderWidth,
    "--shadow": style.shadow,
    "--motion-duration": `${m.durationMs}ms`,
    "--motion-ease": m.easing,
    "--motion-entrance": m.entrance,
    "--motion-stagger": String(m.stagger ?? 0.15),
    "--rough": effects.includes("rough") ? "1" : "0",
  };
  const fillList = fills.length
    ? fills
    : [
        { hex: mix(primary, bgHex, 0.85), fg },
        { hex: mix(accent, bgHex, 0.85), fg },
        { hex: mix(status.success, bgHex, 0.8), fg },
        { hex: mix(status.warning, bgHex, 0.8), fg },
        { hex: mutedHex, fg },
      ];
  fillList.forEach((f, i) => {
    vars[`--fill-${i + 1}`] = f.hex;
    vars[`--fill-${i + 1}-fg`] = bestText(f.hex, [fg, "#000000", "#FFFFFF"]).hex;
  });
  (bg.mesh || []).forEach((c, i) => {
    vars[`--mesh-${i + 1}`] = toHex(c);
  });

  const effectsCss = fs.readFileSync(path.join(SKILL_DIR, "templates", "scenes", "effects.css"), "utf8");
  const blocks = [...effectsCss.matchAll(/\/\*\s*@effect\s+([a-z0-9-]+)\s*\*\/([\s\S]*?)\/\*\s*@end\s*\*\//g)];
  const chosen = blocks.filter(([, name]) => effects.includes(name)).map(([, name, css]) => `/* effect: ${name} */${css}`);
  const tokensCss = `/* ${style.name} (${mode}${args.variant ? `, ${args.variant}` : ""}) generated by theme.mjs */\n:root{\n${Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n")}\n  color-scheme: ${mode};\n}\n${chosen.join("\n")}\n`;

  // Mermaid: hex only, fonts via fonts/mermaid.css.
  const nodeFill = surfaceHex === bgHex || contrast(surfaceHex, bgHex) < 1.08 ? mutedHex : surfaceHex;
  const nodeBorder = contrast(borderHex, nodeFill) < 1.6 ? mix(borderHex, fg, 0.35) : borderHex;
  const scale = fillList.map((f) => f.hex);
  const tv = {
    darkMode: mode === "dark",
    background: bgHex,
    fontFamily: mermaidFont,
    fontSize: "18px",
    primaryColor: nodeFill,
    primaryTextColor: fg,
    primaryBorderColor: nodeBorder,
    lineColor: mutedFg,
    secondaryColor: scale[1] || mutedHex,
    secondaryTextColor: fg,
    secondaryBorderColor: nodeBorder,
    tertiaryColor: scale[2] || bgHex,
    tertiaryTextColor: fg,
    tertiaryBorderColor: nodeBorder,
    mainBkg: nodeFill,
    nodeBorder,
    nodeTextColor: fg,
    textColor: fg,
    clusterBkg: mutedHex,
    clusterBorder: borderHex,
    titleColor: fg,
    edgeLabelBackground: bgHex,
    actorBkg: nodeFill,
    actorBorder: nodeBorder,
    actorTextColor: fg,
    actorLineColor: mutedFg,
    signalColor: fg,
    signalTextColor: fg,
    labelBoxBkgColor: nodeFill,
    labelBoxBorderColor: nodeBorder,
    labelTextColor: fg,
    loopTextColor: fg,
    noteBkgColor: mix(status.warning, bgHex, 0.78),
    noteTextColor: fg,
    noteBorderColor: mix(status.warning, fg, 0.2),
    activationBkgColor: mutedHex,
    activationBorderColor: nodeBorder,
    sequenceNumberColor: primaryFg.hex,
    stateLabelColor: fg,
    altBackground: mutedHex,
  };
  scale.slice(0, 8).forEach((c, i) => {
    tv[`cScale${i}`] = c;
    tv[`cScaleLabel${i}`] = bestText(c, [fg, "#000000", "#FFFFFF"]).hex;
    tv[`fillType${i}`] = c;
  });
  for (const [k, v] of Object.entries(style.mermaid?.themeVariables || {})) {
    tv[k] = typeof v === "string" && /color|bkg|background|border|fill|scale/i.test(k) && !/fontSize/.test(k) ? toHex(v) : v;
  }
  const textFix = bestText(tv.primaryColor, [tv.primaryTextColor, fg, "#000000", "#FFFFFF"]);
  if (contrast(tv.primaryTextColor, tv.primaryColor) < 4.5) {
    adjustments.push({
      token: "mermaid.primaryTextColor",
      from: tv.primaryTextColor,
      to: textFix.hex,
      after: +textFix.ratio.toFixed(2),
      against: "mermaid.primaryColor",
      min: 4.5,
    });
    tv.primaryTextColor = textFix.hex;
    tv.nodeTextColor = textFix.hex;
  }
  let look = style.mermaid?.look || "classic";
  if (look === "neo" && !mermaidSupportsNeo()) look = "classic";
  const mermaidConfig = {
    theme: "base",
    look,
    themeVariables: tv,
    ...(style.mermaid?.themeCSS ? { themeCSS: style.mermaid.themeCSS } : {}),
    fontFamily: mermaidFont,
    securityLevel: "strict",
    flowchart: { curve: "basis", padding: 18, nodeSpacing: 56, rankSpacing: 64, htmlLabels: true, useMaxWidth: false, wrappingWidth: 260 },
    sequence: { useMaxWidth: false, mirrorActors: false, showSequenceNumbers: false, wrap: true, width: 220, actorMargin: 80 },
    state: { useMaxWidth: false },
    journey: { useMaxWidth: false },
    timeline: { useMaxWidth: false },
    er: { useMaxWidth: false },
  };

  const contrastTable = [
    ["foreground", fg, "background", bgHex],
    ["foreground", fg, "surface", surfaceHex],
    ["mutedForeground", mutedFg, "background", bgHex],
    ["primaryForeground", primaryFg.hex, "primary", primary],
    ["accent", accent, "background", bgHex],
    ["mermaid text", tv.primaryTextColor, "mermaid node", tv.primaryColor],
  ].map(([a, ah, b, bh]) => ({ pair: `${a} on ${b}`, fg: ah, bg: bh, ratio: +contrast(ah, bh).toFixed(2) }));

  mkdirp(src);
  fs.writeFileSync(path.join(src, "tokens.css"), tokensCss);
  writeJson(path.join(src, "mermaid-config.json"), mermaidConfig);
  writeJson(path.join(src, "style.json"), style);
  const tokens = {
    style: style.id,
    name: style.name,
    family: style.family,
    mode,
    variant: args.variant || null,
    colors: {
      background: bgHex,
      backgroundStops: stops,
      surface: surfaceHex,
      foreground: fg,
      muted: mutedHex,
      mutedForeground: mutedFg,
      border: borderHex,
      primary,
      primaryForeground: primaryFg.hex,
      accent,
      accentForeground: onFill(accent),
      ...status,
      palette: fillList,
    },
    fonts: {
      heading: used(style.fonts.heading),
      body: used(style.fonts.body),
      mono: used(style.fonts.mono),
      mermaid: used(style.mermaid?.fontFamily || style.fonts.body),
      stacks,
      missing: bundle.missing,
      bundle: bundle.resolved,
    },
    motion: style.motion,
    effects,
    radius: style.radius,
    mermaidLook: look,
    contrast: contrastTable,
    adjustments,
  };
  writeJson(path.join(src, "tokens.json"), tokens);
  const summary = {
    ok: true,
    style: style.id,
    mode,
    variant: args.variant || null,
    src,
    files: ["tokens.css", "tokens.json", "mermaid-config.json", "style.json", "fonts/fonts.css", "fonts/mermaid.css"],
    fonts: tokens.fonts.bundle,
    missingFonts: bundle.missing,
    glyphs,
    adjustments,
    contrast: contrastTable,
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
}

async function main() {
  if (args.list) {
    process.stdout.write(
      JSON.stringify(
        catalog().map((s) => ({ id: s.id, name: s.name, family: s.family, mode: s.defaultMode, description: s.description, bestFor: s.bestFor })),
        null,
        2,
      ) + "\n",
    );
    return;
  }
  if (args.resolve) {
    const hit = resolveStyle(args.resolve);
    process.stdout.write(JSON.stringify(hit ? { id: hit.style.id, name: hit.style.name, score: hit.score } : { id: null }, null, 2) + "\n");
    return;
  }
  if (args.validate) {
    const files = []
      .concat(args.validate)
      .filter((f) => typeof f === "string")
      .concat(args._);
    const res = await validate(files);
    const bad = res.filter((r) => !r.ok);
    process.stdout.write(JSON.stringify({ ok: bad.length === 0, checked: res.length, failures: bad }, null, 2) + "\n");
    if (bad.length) process.exit(1);
    return;
  }
  if (!exists(path.join(WS, "node_modules", "culori"))) die("Toolchain missing. Run setup.mjs first.");
  await build();
}

main().catch((e) => die(e.stack || e.message));
