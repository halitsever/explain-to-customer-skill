/** Colour maths on top of culori: hex conversion, alpha compositing, WCAG contrast and AA repair. */
import { importTool } from "./common.mjs";

let C;
export async function initColor() {
  if (!C) C = await importTool("culori");
  return C;
}

export function parse(str) {
  const c = C.parse(String(str).trim());
  if (!c) throw new Error(`Unparseable colour: ${str}`);
  return C.converter("rgb")(c);
}
export const alphaOf = (str) => {
  const c = parse(str);
  return c.alpha ?? 1;
};
export const toHex = (str) => C.formatHex(C.clampRgb(parse(str))).toUpperCase();

/** Flatten a possibly translucent colour onto an opaque background. */
export function composite(top, bottom) {
  const t = parse(top);
  const b = parse(bottom);
  const a = t.alpha ?? 1;
  const mixc = (x, y) => x * a + y * (1 - a);
  return C.formatHex({ mode: "rgb", r: mixc(t.r, b.r), g: mixc(t.g, b.g), b: mixc(t.b, b.b) }).toUpperCase();
}

export const contrast = (a, b) => C.wcagContrast(parse(a), parse(b));

export function mix(a, b, t) {
  return C.formatHex(C.interpolate([parse(a), parse(b)], "oklab")(t)).toUpperCase();
}

/** The candidate with the highest minimum contrast against every background. */
export function bestText(backgrounds, candidates) {
  const bgs = [].concat(backgrounds);
  let best = null;
  for (const c of candidates) {
    const r = Math.min(...bgs.map((bg) => contrast(c, bg)));
    if (!best || r > best.ratio) best = { hex: toHex(c), ratio: r };
  }
  return best;
}

/**
 * Nudge a colour's OKLCH lightness until it reaches `min` contrast against every background.
 * Tries both directions and keeps the smaller change.
 */
export function ensureContrast(color, backgrounds, min) {
  const bgs = [].concat(backgrounds);
  const ratio = (hex) => Math.min(...bgs.map((bg) => contrast(hex, bg)));
  const start = toHex(color);
  const before = ratio(start);
  if (before >= min) return { hex: start, changed: false, before, after: before };
  const lch = C.converter("oklch")(parse(start));
  const tryDir = (dir) => {
    for (let step = 1; step <= 100; step++) {
      const l = Math.min(1, Math.max(0, lch.l + dir * step * 0.01));
      const hex = C.formatHex(C.clampChroma({ ...lch, l, alpha: 1 }, "oklch")).toUpperCase();
      if (ratio(hex) >= min) return { hex, step };
      if (l === 0 || l === 1) break;
    }
    return null;
  };
  const down = tryDir(-1);
  const up = tryDir(1);
  const pick = [down, up].filter(Boolean).sort((a, b) => a.step - b.step)[0];
  if (!pick) {
    const fallback = bestText(bgs, ["#000000", "#FFFFFF"]);
    return { hex: fallback.hex, changed: true, before, after: fallback.ratio };
  }
  return { hex: pick.hex, changed: true, before, after: ratio(pick.hex) };
}
