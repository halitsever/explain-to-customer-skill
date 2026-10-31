/** storyboard.json -> standalone scene documents in _source/scenes/. The same documents feed stills and the video. */
import fs from "node:fs";
import path from "node:path";
import { SKILL_DIR, WS, readJson, exists, mkdirp, escapeHtml, resolveTool } from "./common.mjs";

const TPL = path.join(SKILL_DIR, "templates", "scenes");
export const STILL_ONLY = new Set(["summary-card"]);

export const LABELS = {
  tr: { before: "Önce", after: "Şimdi", action: "Sizden beklenen", none: "Sizin bir şey yapmanıza gerek yok." },
  en: { before: "Before", after: "Now", action: "What you need to do", none: "Nothing to do on your side." },
  de: { before: "Vorher", after: "Jetzt", action: "Was Sie tun müssen", none: "Sie müssen nichts tun." },
  fr: { before: "Avant", after: "Maintenant", action: "Ce que vous devez faire", none: "Rien à faire de votre côté." },
  es: { before: "Antes", after: "Ahora", action: "Lo que necesita hacer", none: "No tiene que hacer nada." },
  it: { before: "Prima", after: "Ora", action: "Cosa deve fare", none: "Non deve fare nulla." },
  nl: { before: "Voor", after: "Nu", action: "Wat u moet doen", none: "U hoeft niets te doen." },
  pt: { before: "Antes", after: "Agora", action: "O que você precisa fazer", none: "Você não precisa fazer nada." },
};

const ICON = {
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  arrow: '<path d="M4 12h15M13 6l6 6-6 6"/>',
  alert: '<path d="M12 3.5L2.8 19.5h18.4L12 3.5z"/><path d="M12 10v4.5M12 17.4v.1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/>',
  spark: '<path d="M12 3l2.1 6.9L21 12l-6.9 2.1L12 21l-2.1-6.9L3 12l6.9-2.1L12 3z"/>',
  pointer: '<path d="M5 3l6 16 2.4-6.6L20 10 5 3z"/>',
  flow: '<rect x="3" y="4" width="7" height="6" rx="1.5"/><rect x="14" y="14" width="7" height="6" rx="1.5"/><path d="M6.5 10v4.5a2 2 0 002 2H14"/>',
};
export const icon = (name) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICON[name] || ICON.spark}</svg>`;

/** Escape, then turn **text** into <mark>text</mark> for emphasis. */
export const md = (s) => escapeHtml(s).replace(/\*\*(.+?)\*\*/g, "<mark>$1</mark>");
const fillTpl = (tpl, data) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => data[k] ?? "");
const tpl = (name) => fs.readFileSync(path.join(TPL, `${name}.html`), "utf8");

export function labelsFor(sb) {
  const lang = String(sb.meta?.lang || "en")
    .slice(0, 2)
    .toLowerCase();
  return { ...(LABELS[lang] || LABELS.en), ...(sb.meta?.labels || {}) };
}

export function sceneFileName(i, scene) {
  const id = String(scene.id || scene.type || `scene-${i + 1}`)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-");
  return `${String(i + 1).padStart(2, "0")}-${id}.html`;
}

/** Copy an asset into _source/assets when it lives elsewhere; return its path relative to _source. */
function localAsset(src, p) {
  if (!p) return null;
  const abs = path.isAbsolute(p) ? p : path.join(src, p);
  if (!exists(abs)) return { missing: p };
  const rel = path.relative(src, abs);
  if (!rel.startsWith("..") && !path.isAbsolute(rel)) return { rel: rel.split(path.sep).join("/") };
  const dest = path.join(src, "assets", path.basename(abs));
  mkdirp(path.dirname(dest));
  fs.copyFileSync(abs, dest);
  return { rel: `assets/${path.basename(abs)}` };
}

function img(src, p, attrs = "") {
  const a = localAsset(src, p);
  if (!a) return "";
  if (a.missing) return `<img src="../${escapeHtml(a.missing)}" alt="" data-missing ${attrs}>`;
  return `<img src="../${escapeHtml(a.rel)}" alt="" ${attrs}>`;
}

const illustration = (name = "spark") =>
  `<div class="illustration"><span class="blob b1"></span><span class="blob b2"></span><span class="blob b3"></span><div class="glyph">${icon(name)}</div></div>`;

const LIST_KEYS = ["items", "steps", "callouts", "benefits", "points", "actions", "lines", "bullets"];

/** Heading plus body lines. Also accepts body lines under data.items / data.steps / … when onScreenText holds only the heading. */
function textLines(scene) {
  const t = [...(scene.onScreenText || [])];
  const d = scene.data || {};
  if (t.length <= 1) {
    const key = LIST_KEYS.find((k) => Array.isArray(d[k]) && d[k].length);
    if (key) t.push(...d[key].map((x) => (typeof x === "string" ? x : (x?.text ?? ""))).filter(Boolean));
    else if (typeof d.text === "string") t.push(d.text);
  }
  return t;
}

function sectionFor(scene, ctx) {
  const { src, sb, labels } = ctx;
  const t = textLines(scene);
  const d = scene.data || {};
  const id = escapeHtml(scene.id || scene.type);
  const product = sb.meta?.product || sb.meta?.project || "";
  const logo = sb.meta?.logo ? img(src, sb.meta.logo, 'class="brand-logo" data-anim') : "";
  const lead = (s, extra = "") => (s ? `<p class="lead" data-anim data-fit data-max-lines="2" data-min="40"${extra}>${md(s)}</p>` : "");
  const textP = (s, lines = 3) => `<p class="text" data-fit data-max-lines="${lines}" data-min="36">${md(s)}</p>`;
  switch (scene.type) {
    case "title":
      return fillTpl(tpl("title"), { id, logo, eyebrow: md(d.eyebrow || product), heading: md(t[0] || sb.meta?.title || ""), subtitle: lead(t[1]) });
    case "before-after": {
      const before = d.before || { text: t[1] };
      const after = d.after || { text: t[2] };
      const thumb = (p) => (p ? `<div class="thumb">${img(src, p)}</div>` : "");
      return fillTpl(tpl("before-after"), {
        id,
        heading: md(t[0] || ""),
        beforeIcon: icon("x"),
        afterIcon: icon("check"),
        arrowIcon: icon("arrow"),
        beforeLabel: md(before.label || labels.before),
        afterLabel: md(after.label || labels.after),
        beforeText: md(before.text || ""),
        afterText: md(after.text || ""),
        beforeImage: thumb(before.image),
        afterImage: thumb(after.image),
      });
    }
    case "screenshot-callouts": {
      const shot = scene.assets?.[0] ? img(src, scene.assets[0], "data-kenburns") : illustration("pointer");
      const callouts = t
        .slice(1)
        .map((c, i) => `<li data-anim><span class="badge">${i + 1}</span>${textP(c, 3)}</li>`)
        .join("");
      return fillTpl(tpl("screenshot-callouts"), { id, heading: md(t[0] || ""), image: shot, callouts });
    }
    case "steps": {
      const steps = t
        .slice(1, 5)
        .map((s, i) => `<li class="card step" data-anim><span class="num">${i + 1}</span>${textP(s, 4)}</li>`)
        .join("");
      return fillTpl(tpl("steps"), { id, heading: md(t[0] || ""), steps });
    }
    case "diagram": {
      const image = scene.assets?.[0] ? img(src, scene.assets[0]) : illustration("flow");
      return fillTpl(tpl("diagram"), { id, heading: md(t[0] || ""), image, caption: lead(t[1]) });
    }
    case "benefits": {
      const list = t.slice(1, 5);
      const items = list.map((b) => `<li class="card benefit" data-anim><span class="badge badge--success">${icon("check")}</span>${textP(b, 3)}</li>`).join("");
      const cols = list.length <= 2 ? list.length || 1 : list.length === 4 ? 2 : 3;
      return fillTpl(tpl("benefits"), { id, heading: md(t[0] || ""), items, cols });
    }
    case "action-needed": {
      const none = d.none === true || t.length <= 1;
      const content = none
        ? `<div class="nothing" data-anim><span class="badge badge--success">${icon("check")}</span><p class="lead" data-fit data-max-lines="3" data-min="40">${md(t[1] || labels.none)}</p></div>`
        : `<ol class="actions">${t
            .slice(1, 5)
            .map((a) => `<li data-anim><span class="badge badge--warning">${icon("arrow")}</span>${textP(a, 3)}</li>`)
            .join("")}</ol>`;
      return fillTpl(tpl("action-needed"), { id, heading: md(t[0] || labels.action), content });
    }
    case "outro":
      return fillTpl(tpl("outro"), { id, logo, heading: md(t[0] || ""), subtitle: lead(t[1]), eyebrow: md(d.eyebrow || product) });
    case "summary-card": {
      const b = sb.brief || {};
      const points = (d.points || t.slice(1, 4))
        .slice(0, 3)
        .map((p) => `<li><span class="badge badge--success">${icon("check")}</span>${textP(p, 2)}</li>`)
        .join("");
      // Without a screenshot the key visual is a before/after pair from the brief; abstract shapes are the last resort.
      const before = d.before || b.before;
      const after = d.after || b.after;
      const miniBa =
        before && after
          ? `<div class="mini-ba"><div class="card card--before"><span class="pill pill--before">${icon("x")}<span>${md(labels.before)}</span></span>${textP(before, 3)}</div>` +
            `<div class="arrow">${icon("arrow")}</div><div class="card card--after"><span class="pill pill--after">${icon("check")}<span>${md(labels.after)}</span></span>${textP(after, 3)}</div></div>`
          : null;
      const visual = scene.assets?.[0] ? img(src, scene.assets[0]) : miniBa || illustration(d.icon || "spark");
      const eyebrow = [d.eyebrow || product, sb.meta?.date].filter(Boolean).join(" · ");
      return fillTpl(tpl("summary-card"), {
        id,
        eyebrow: md(eyebrow),
        heading: md(t[0] || b.title || sb.meta?.title || ""),
        points,
        actionLabel: md(d.actionLabel || labels.action),
        actionText: md(d.action || b.customerAction || labels.none),
        visual,
      });
    }
    default:
      throw new Error(
        `Unknown scene type "${scene.type}" (scene ${scene.id}). Use: title, before-after, screenshot-callouts, steps, diagram, benefits, action-needed, outro, summary-card.`,
      );
  }
}

/** Copy the scene runtime (CSS, bake script, GSAP, rough.js) into _source/lib so _source renders offline on its own. */
export function writeLib(src) {
  const lib = path.join(src, "lib");
  mkdirp(lib);
  for (const f of ["base.css", "runtime.js", "anim.js"]) fs.copyFileSync(path.join(TPL, f), path.join(lib, f));
  const gsapDir = path.dirname(resolveTool("gsap", "package.json"));
  fs.copyFileSync(path.join(gsapDir, "dist", "gsap.min.js"), path.join(lib, "gsap.min.js"));
  fs.copyFileSync(path.join(gsapDir, "dist", "CustomEase.min.js"), path.join(lib, "CustomEase.min.js"));
  fs.copyFileSync(path.join(WS, "node_modules", "roughjs", "bundled", "rough.js"), path.join(lib, "rough.js"));
}

/**
 * Write scenes/NN-id.html for every storyboard scene. A scene file is regenerated when storyboard.json is newer,
 * unless its <section> carries data-keep (hand-edited); --force regenerates everything.
 */
export function buildScenes(src, { force = false } = {}) {
  const sbPath = path.join(src, "storyboard.json");
  const sb = readJson(sbPath);
  if (!Array.isArray(sb.scenes) || !sb.scenes.length) throw new Error("storyboard.json has no scenes");
  writeLib(src);
  const dir = path.join(src, "scenes");
  mkdirp(dir);
  const labels = labelsFor(sb);
  const sbTime = fs.statSync(sbPath).mtimeMs;
  const doc = fs.readFileSync(path.join(TPL, "_document.html"), "utf8");
  const wanted = new Set();
  const out = [];
  const warnings = [];
  sb.scenes.forEach((scene, i) => {
    const file = sceneFileName(i, scene);
    wanted.add(file);
    const p = path.join(dir, file);
    const keep = exists(p) && /<section[^>]*\sdata-keep/.test(fs.readFileSync(p, "utf8"));
    const stale = !exists(p) || fs.statSync(p).mtimeMs < sbTime;
    const needsBody = ["screenshot-callouts", "steps", "benefits"].includes(scene.type);
    if (needsBody && textLines(scene).length < 2)
      warnings.push({ scene: scene.id, kind: "empty-scene", detail: `${scene.type} has only a heading; put the lines in onScreenText[1..]` });
    if (force || (stale && !keep)) {
      const section = sectionFor(scene, { src, sb, labels });
      fs.writeFileSync(p, fillTpl(doc, { lang: escapeHtml(sb.meta?.lang || "en"), title: escapeHtml(`${scene.id} · ${sb.meta?.title || ""}`), section }));
    }
    out.push({ index: i, scene, file, path: p });
  });
  for (const f of fs.readdirSync(dir)) if (f.endsWith(".html") && !wanted.has(f)) fs.rmSync(path.join(dir, f));
  return { sb, scenes: out, warnings };
}

/** Video timing: still-only scenes are skipped, the rest play back to back. */
export function timeline(scenes) {
  let t = 0;
  const list = [];
  for (const s of scenes) {
    if (STILL_ONLY.has(s.scene.type)) continue;
    const duration = Number(s.scene.durationS) || 4;
    list.push({ ...s, start: +t.toFixed(3), duration });
    t += duration;
  }
  return { list, total: +t.toFixed(3) };
}

export const sectionOf = (html) => {
  const m = html.match(/<!--scene:start-->([\s\S]*?)<!--scene:end-->/);
  return m ? m[1].trim() : null;
};
