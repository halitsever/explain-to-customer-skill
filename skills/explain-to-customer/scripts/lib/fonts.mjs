/** Local font bundles from @fontsource packages (plus Selawik from setup). Nothing loads from a CDN. */
import fs from "node:fs";
import path from "node:path";
import { WS, exists, mkdirp } from "./common.mjs";

const ALIASES = { geist: "geist-sans", "geist sans": "geist-sans" };
const GENERIC = {
  mono: ["ui-monospace", "monospace"],
  serif: ["Georgia", "serif"],
  sans: ["system-ui", "sans-serif"],
  hand: ["cursive"],
};
const KIND = {
  "jetbrains-mono": "mono",
  "geist-mono": "mono",
  "ibm-plex-mono": "mono",
  "source-serif-4": "serif",
  caveat: "hand",
  kalam: "hand",
};

export const fontsourceId = (family) => {
  const k = String(family).trim().toLowerCase();
  return ALIASES[k] || k.replace(/\s+/g, "-");
};

/** Subsets needed for a language code; latin + latin-ext always (Turkish lives in latin-ext). */
export function subsetsForLang(lang = "") {
  const l = String(lang).toLowerCase().slice(0, 2);
  const s = ["latin", "latin-ext"];
  if (["ru", "uk", "bg", "sr", "mk", "be", "kk"].includes(l)) s.push("cyrillic", "cyrillic-ext");
  if (l === "el") s.push("greek", "greek-ext");
  if (l === "vi") s.push("vietnamese");
  return s;
}

function packageDir(id) {
  return path.join(WS, "node_modules", "@fontsource", id);
}

export function isInstalled(family) {
  const id = fontsourceId(family);
  if (id === "selawik") return exists(path.join(WS, "fonts", "selawik", "selawk.woff2"));
  return exists(path.join(packageDir(id), "package.json"));
}

function availableWeights(id) {
  const dir = path.join(packageDir(id), "files");
  if (!exists(dir)) return [];
  const ws = new Set();
  for (const f of fs.readdirSync(dir)) {
    const m = f.match(/-(\d{3})-normal\.woff2$/);
    if (m) ws.add(Number(m[1]));
  }
  return [...ws].sort((a, b) => a - b);
}
const nearest = (list, w) => list.reduce((best, x) => (Math.abs(x - w) < Math.abs(best - w) ? x : best), list[0]);

/** @font-face entries (absolute file paths) for one family, chosen weights and subsets. */
export function faces(family, weights, subsets) {
  const id = fontsourceId(family);
  if (id === "selawik") {
    const dir = path.join(WS, "fonts", "selawik");
    const map = JSON.parse(fs.readFileSync(path.join(dir, "weights.json"), "utf8"));
    const avail = Object.entries(map).map(([file, w]) => ({ file, w }));
    const out = [];
    for (const w of new Set(
      weights.map((x) =>
        nearest(
          avail.map((a) => a.w),
          x,
        ),
      ),
    )) {
      const a = avail.find((v) => v.w === w);
      out.push({ family, weight: w, file: path.join(dir, a.file), unicodeRange: null, subset: "all", license: path.join(dir, "LICENSE") });
    }
    return out;
  }
  const dir = packageDir(id);
  const avail = availableWeights(id);
  if (!avail.length) return [];
  const out = [];
  for (const w of new Set(weights.map((x) => nearest(avail, x)))) {
    const cssFile = path.join(dir, `${w}.css`);
    const css = exists(cssFile) ? fs.readFileSync(cssFile, "utf8") : "";
    // Subset comes from the file name (<id>-<subset>-<weight>-normal.woff2); comment formats differ between packages.
    for (const [, body] of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
      if (!/font-style:\s*normal/.test(body)) continue;
      const url = (body.match(/url\(\.\/files\/([^)]+\.woff2)\)/) || [])[1];
      if (!url) continue;
      const subset = url.replace(`${id}-`, "").replace(/-\d{3}-normal\.woff2$/, "");
      if (!subsets.includes(subset)) continue;
      const range = (body.match(/unicode-range:\s*([^;]+);/) || [])[1];
      out.push({ family, weight: w, file: path.join(dir, "files", url), unicodeRange: range?.trim() || null, subset, license: path.join(dir, "LICENSE") });
    }
  }
  return out;
}

export function stackFor(family, fallbackFamily = "Inter") {
  const id = fontsourceId(family);
  const kind = KIND[id] || (/mono/i.test(family) ? "mono" : /serif/i.test(family) && !/sans/i.test(family) ? "serif" : "sans");
  const list = [`"${family}"`];
  if (fallbackFamily && fallbackFamily !== family && kind !== "mono") list.push(`"${fallbackFamily}"`);
  return [...list, ...GENERIC[kind]].join(", ");
}

/**
 * Copy the woff2 files for every requested family into destDir and write fonts.css,
 * mermaid.css (same faces, read by mermaid-cli) and LICENSE (mermaid-cli refuses to embed without one).
 * specs: [{ family, weights: [400, 700] }]
 */
export function writeFontBundle(destDir, specs, lang) {
  mkdirp(destDir);
  const subsets = subsetsForLang(lang);
  const resolved = [];
  const missing = [];
  const licenses = new Map();
  const rules = [];
  const merged = new Map();
  for (const s of specs) {
    const prev = merged.get(s.family) || new Set();
    s.weights.forEach((w) => prev.add(w));
    merged.set(s.family, prev);
  }
  for (const [family, wset] of merged) {
    let fam = family;
    if (!isInstalled(fam)) {
      missing.push(fam);
      fam = "Inter";
    }
    const list = faces(fam, [...wset], subsets);
    if (!list.length) {
      missing.push(fam);
      continue;
    }
    for (const f of list) {
      const name = path.basename(f.file);
      fs.copyFileSync(f.file, path.join(destDir, name));
      rules.push(
        `@font-face{font-family:"${fam}";font-style:normal;font-display:block;font-weight:${f.weight};src:url("./${name}") format("woff2");${f.unicodeRange ? `unicode-range:${f.unicodeRange};` : ""}}`,
      );
      if (exists(f.license)) licenses.set(fam, fs.readFileSync(f.license, "utf8"));
    }
    resolved.push({ requested: family, used: fam, weights: [...new Set(list.map((f) => f.weight))], subsets: [...new Set(list.map((f) => f.subset))] });
  }
  const css = rules.join("\n") + "\n";
  fs.writeFileSync(path.join(destDir, "fonts.css"), css);
  fs.writeFileSync(path.join(destDir, "mermaid.css"), css);
  const lic = [...licenses].map(([fam, text]) => `${fam}\n${"-".repeat(fam.length)}\n${text.trim()}\n`).join("\n");
  fs.writeFileSync(path.join(destDir, "LICENSE"), lic || "SIL Open Font License 1.1\n");
  return { resolved, missing };
}
