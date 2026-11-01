import fs from "node:fs";
import path from "node:path";

export interface StyleInfo {
  id: string;
  name: string;
  family: string;
  description: string;
  bestFor: string;
  mode: string;
  swatch: string[];
}

declare const data: StyleInfo[];
export { data };

/** Catalog order, the same order the skill asks in. */
const ORDER = [
  "shadcn",
  "vercel",
  "linear",
  "stripe",
  "apple",
  "notion",
  "material",
  "fluent",
  "neo-brutalism",
  "glass",
  "whiteboard",
  "terminal",
  "carbon",
  "primer",
  "blueprint",
  "swiss",
  "nord",
  "catppuccin",
  "dracula",
  "clay",
  "executive",
];

// Builds run from the repository root, locally and in CI.
const STYLES_DIR = path.resolve(process.cwd(), "skills/explain-to-customer/styles");

export default {
  watch: [path.join(STYLES_DIR, "*.json")],
  load(): StyleInfo[] {
    return fs
      .readdirSync(STYLES_DIR)
      .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
      .map((f) => JSON.parse(fs.readFileSync(path.join(STYLES_DIR, f), "utf8")))
      .sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id))
      .map((s) => ({
        id: s.id,
        name: s.name,
        family: s.family,
        description: s.description,
        bestFor: s.bestFor,
        mode: s.defaultMode,
        swatch: [s.colors.background, s.colors.foreground, s.colors.accent].map((c: string) => (c.startsWith("#") ? c : "#888888")),
      }));
  },
};
