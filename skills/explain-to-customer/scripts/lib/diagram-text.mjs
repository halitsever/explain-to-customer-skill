/** Pulls the human-readable text out of Mermaid source so QA can scan diagram labels like any other on-screen text. */

const TYPE_LINE = /^\s*(flowchart|graph|sequenceDiagram|stateDiagram(-v2)?|journey|timeline|erDiagram|classDiagram|gantt|pie|mindmap|quadrantChart|gitGraph)\b/;
const STYLE_LINE = /^\s*(classDef|class|style|linkStyle|direction|rect|end)\b/;
const WHOLE_LINE = /^\s*(?:title|section|accTitle|accDescr|loop|alt|else|opt|par|and|critical|break|option)\b\s*:?\s*(.+)$/i;
const NOTE_LINE = /^\s*note\s+(?:left of|right of|over)\s+[^:]+:\s*(.+)$/i;
const ALIAS_LINE = /^\s*(?:participant|actor)\s+\S+\s+as\s+(.+)$/i;

function clean(s) {
  let c = String(s ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Nested shapes like ([...]) or [("...")] leave the inner delimiters on the captured text.
  for (let prev = ""; prev !== c; ) {
    prev = c;
    if (/^[[({]/.test(c) && /[\])}]$/.test(c)) c = c.slice(1, -1).trim();
    c = c.replace(/^["'`]+|["'`]+$/g, "").trim();
  }
  return c;
}

/**
 * Labels on one Mermaid line: quoted strings, node shapes ([...], (...), {...}), edge labels (-- x --> and |x|),
 * and the text after ':' in sequence, state, journey and timeline lines.
 */
export function extractLabels(line) {
  const raw = String(line);
  if (/^\s*%%/.test(raw) || STYLE_LINE.test(raw)) return [];
  const out = new Set();
  const add = (s) => {
    const c = clean(s);
    if (c && /[\p{L}\p{N}]/u.test(c)) out.add(c);
  };

  const whole = raw.match(NOTE_LINE) || raw.match(ALIAS_LINE) || raw.match(WHOLE_LINE);
  if (whole) {
    add(whole[1]);
    return [...out];
  }

  for (const [, q] of raw.matchAll(/"([^"]+)"/g)) add(q);
  for (const [, b] of raw.matchAll(/\[\/?\\?([^[\]]+?)\/?\\?\]/g)) add(b);
  for (const [, b] of raw.matchAll(/\(+([^()]+)\)+/g)) add(b);
  for (const [, b] of raw.matchAll(/\{+([^{}]+)\}+/g)) add(b);
  for (const [, b] of raw.matchAll(/\w>([^[\]>]+)\]/g)) add(b);
  for (const [, e] of raw.matchAll(/\|([^|]+)\|/g)) add(e);
  for (const [, e] of raw.matchAll(/--\s+([^->|][^>|]*?)\s+--+>/g)) add(e);
  // Sequence messages, state descriptions, journey tasks and timeline events all put their text after a colon.
  const colon = raw.match(/^[^:"]*?(?:-+>>?|--?x|--?\)|:)\s*[^:]*?:\s*(.+)$/) || raw.match(/^\s*[^:"[\]{}()]+:\s*(.+)$/);
  if (colon) for (const part of colon[1].split(/\s*:\s*/)) if (!/^\d+$/.test(part)) add(part);
  const task = raw.match(/^\s*([^:"[\]{}()]+?)\s*:\s*\d+\s*:/);
  if (task) add(task[1]);
  return [...out];
}

/** Every label in a Mermaid file, with its 1-based line number. */
export function diagramLabels(source) {
  const rows = [];
  let seenType = false;
  String(source)
    .split(/\r?\n/)
    .forEach((line, i) => {
      if (!seenType && TYPE_LINE.test(line)) {
        seenType = true;
        return;
      }
      for (const text of extractLabels(line)) rows.push({ line: i + 1, text });
    });
  return rows;
}
