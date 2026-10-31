# Styles

Read when the user picks a style family, types Other, or wants to change or add a style. The preview sheet is `${CLAUDE_SKILL_DIR}/styles-preview.png`.

## Catalog

Each style is `styles/<id>.json`, validated by `styles/_schema.json`. Styles are inspired by public design languages; they use open fonts only and carry no logos, trademarks or product screenshots.

| id | Family | Essence |
|---|---|---|
| `shadcn` | Modern SaaS | Neutral zinc, 1px borders, soft cards, calm; light |
| `vercel` | Modern SaaS | Monochrome, high contrast, hairline grid; dark |
| `linear` | Modern SaaS | Dark and sleek, radial glows, gradient headlines, blur-in |
| `stripe` | Modern SaaS | Polished fintech, gradient mesh band, navy type |
| `apple` | Clean & friendly | Keynote: huge headlines, whitespace, slow motion |
| `notion` | Clean & friendly | Warm document, serif headings, tinted callouts |
| `material` | Clean & friendly | Material 3 tonal surfaces, big radii |
| `fluent` | Clean & friendly | Fluent 2, layered Mica-like surfaces, Selawik |
| `neo-brutalism` | Bold & creative | Thick borders, hard shadows, flat brights |
| `glass` | Bold & creative | Frosted panels over a purple-blue aurora |
| `whiteboard` | Bold & creative | Hand-drawn sketch, marker highlights, draw-on strokes |
| `terminal` | Bold & creative | Retro CRT, green phosphor (variant `amber`); technical audiences |
| `carbon` | Extended | IBM Carbon: square, grid-based, IBM Plex |
| `primer` | Extended | GitHub Primer: diff-style before/after |
| `blueprint` | Extended | Blue grid paper, dimension lines; architecture |
| `swiss` | Extended | Editorial grid, huge numerals, red rules |
| `nord` | Extended | Calm arctic developer palette |
| `catppuccin` | Extended | Soft pastels: Mocha dark, Latte light |
| `dracula` | Extended | Classic dark developer theme |
| `clay` | Extended | Claymorphism: puffy pastel cards |
| `executive` | Extended | Boardroom navy and teal (variant `gold`) |

The `Exact style` question shows the four styles of the chosen family. `theme.mjs --list` prints the catalog as JSON.

## Applying a style

```
node "${CLAUDE_SKILL_DIR}/scripts/theme.mjs" --style <id|name|path.json> --src SRC [--mode light|dark] [--variant amber] [--lang tr]
```

It writes into `SRC`: `tokens.css` (CSS variables plus the style's effect rules), `tokens.json` (final hex values, contrast table, adjustments), `mermaid-config.json`, `style.json` and `fonts/` (local woff2 files with `fonts.css`, `mermaid.css` and the font licences).

The JSON's `glyphs` field says, per font, whether every letter of the run language is in the bundled files. When a font misses letters, the browser silently swaps in a fallback for them: pick a style whose fonts cover the language, or a custom style with a font that does.

### Token mapping

- Colours become `--bg`, `--surface`, `--fg`, `--muted`, `--muted-fg`, `--border`, `--primary`, `--primary-fg`, `--accent`, `--accent-fg`, `--success`, `--warning`, `--danger` (each status colour with a `-fg`), `--fill-1…5` from `palette` (or tints derived from primary and accent), `--mesh-n`, and `--bg-image` for gradients.
- Fonts become `--font-heading`, `--font-body`, `--font-mono` stacks; `typography` sets weight, tracking, case and a type scale. `radius`, `borderWidth`, `shadow` and `motion` map one to one.
- `effects` pick CSS blocks from `templates/scenes/effects.css` (grid, glow, mesh, glass, paper, rough, scanlines, huge-numerals …).
- Mermaid `themeVariables` are derived as hex (oklch, hsl and translucent colours are converted and flattened onto the background): `primaryColor`, `primaryTextColor`, `primaryBorderColor`, `lineColor`, `secondaryColor`, `tertiaryColor`, `background`, `mainBkg`, `nodeBorder`, `clusterBkg`, `titleColor`, `edgeLabelBackground`, `actorBkg`, `actorBorder`, `actorTextColor`, `signalColor`, `noteBkgColor`, `fontFamily` and more. `mermaid.themeVariables` in the style JSON override them.

### Contrast

theme.mjs enforces WCAG AA before anything renders: text and muted text 4.5:1 against every background, gradient stop and surface; text on primary 4.5:1; accent 3:1 (it marks callouts and large text); text on palette fills 4.5:1; Mermaid node text 4.5:1. Failing tokens move in OKLCH lightness, by the smallest step that passes, and are listed in `adjustments`. Tell the user when an anchor colour changed.

## Match my project

```
node "${CLAUDE_SKILL_DIR}/scripts/detect-project-style.mjs" --project <root> --src SRC
node "${CLAUDE_SKILL_DIR}/scripts/theme.mjs" --style SRC/style.json --src SRC
```

It reads, in this order: shadcn `components.json` and CSS variables (`--background`, `--foreground`, `--primary`, `--radius` …, including Tailwind v4 `@theme`, `.dark` blocks, oklch and bare HSL values), `tailwind.config.*`, other CSS custom properties and SCSS variables, MUI/Chakra/Mantine theme files, design-token JSON, `DESIGN.md`/`frame.md`, fonts (`next/font`, `geist`, `@font-face`, Google Fonts links), the default light or dark mode, and a logo inside the repo (`public/`, `assets/`, favicon). The logo is copied to `SRC/brand/`; set `meta.logo` to it. Logos are never downloaded.

Fonts found in the project are installed from Fontsource into the tool workspace when an open package exists; otherwise the base font stays and a note says so. Missing tokens come from `shadcn` (or `--base <id>`), with neutrals tinted toward the detected primary. Report `detected` (with source files) and `guessed` to the user. Nothing usable means plain `shadcn`; say so.

## Other input

- A style name or id from the extended list, even misspelled: `theme.mjs --resolve "<text>"` returns the best match; confirm it if the score is below 80.
- Brand hex colours (`#E11D48, #0EA5E9`): `detect-project-style.mjs --colors "<hex,hex>" --src SRC [--mode dark]`, then theme with `SRC/style.json`. First colour is primary, second accent, more become palette fills.
- A website URL: `detect-project-style.mjs --url <url> --src SRC`. It opens the page with Playwright and reads computed colours and fonts of body, headings, buttons, links and inputs. It never takes a logo from a URL.

## Adding or editing a style

1. Copy the closest `styles/<id>.json` to a new id; keep the hex anchors that define it.
2. Fonts must be open (Fontsource family names; `setup.mjs --add-font "<Family>"` installs one). No proprietary fonts such as SF Pro, Segoe or Söhne.
3. `theme.mjs --validate` checks every style against the schema.
4. `styles-preview.mjs` regenerates `styles-preview.png`.
