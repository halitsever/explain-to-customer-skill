---
name: explain-to-customer
description: Turns a code change into customer-friendly visuals (short MP4 video, annotated images, Mermaid diagrams) in a chosen visual style and saves them where the user picks. Use when the user runs /explain-to-customer or asks to explain or show a change to a customer or client.
argument-hint: '[commit|range|PR#|"what changed"] [video|image|diagram|all] [style=ID] [out=project|cwd|desktop|videos|PATH] [lang=CODE] [audience=technical] [--yes]'
disable-model-invocation: true
allowed-tools:
  - Bash(git status *)
  - Bash(git diff *)
  - Bash(git log *)
  - Bash(git show *)
  - Bash(git rev-parse *)
  - Bash(gh pr view *)
  - Bash(gh pr diff *)
  - Bash(node "${CLAUDE_SKILL_DIR}/scripts/*)
  - Bash(ffprobe *)
  - Read(/${CLAUDE_SKILL_DIR}/**)
---

# Explain a change to a customer

Arguments: `$ARGUMENTS`

Turn one code change into a short, honest, polished explanation for a non-technical client: video, stills, diagrams and a ready-to-send message, in one visual style.

## Ground rules

- Run every bundled script as its own command, exactly `node "${CLAUDE_SKILL_DIR}/scripts/<script>.mjs" …`. No `&&`, pipes, `;` or `cd` around it; the pre-approval rule only matches the bare command. Scripts print JSON on stdout and progress on stderr.
- `SRC` below means the run's `_source` folder (`src` from `--resolve-out`). Every render script takes `--src SRC`.
- The project is read-only. Write only into the output folder and the tool workspace. Never edit, commit, stash, check out or push the user's code, and never add dependencies to it.
- Render locally. Never use HyperFrames cloud, publish or share features.
- Follow the honesty and privacy rules in `reference/storytelling.md` for every on-screen word.
- Fail soft: if one output fails, deliver the others and say what failed and how to fix it.

## Step 0: Arguments

Parse `$ARGUMENTS` loosely and keep what is set. Never ask a question the arguments already answer.

- Scope: a commit (`a1b2c3d`, `HEAD~2`), a range (`main..HEAD`, `HEAD~3..HEAD`), `PR#123` or `#123`, or quoted text describing the change.
- Format: `video`, `image`, `diagram` or `all` (accept `mp4`, `images`, `stills`, `diagrams`, `mermaid`).
- `style=`: a catalog id or name, `match` (Match my project), brand hex colours (`style=#E11D48,#0EA5E9`) or a website URL; `out=` (`project`, `cwd`, `desktop`, `videos` or a path); `lang=` (e.g. `tr`, `en`); `audience=technical`.
- `--yes` skips the Approve question and uses defaults for anything still open.

## Step 1: Preflight

Run `node "${CLAUDE_SKILL_DIR}/scripts/preflight.mjs"` and keep the JSON as PRE. It holds OS, project, git scope, save paths, tool status, a responding dev server and the last-used answers.

Outside git with no quoted description, ask in one short question what changed.

## Step 2: Quick scan

Pick the scope: arguments first; otherwise PRE `git.suggestedScope` (feature branch: everything since it left the default branch plus uncommitted work; default branch: uncommitted changes, else the last commit). Run its `diffStat` and `log` commands. For `PR#n` use `gh pr view n --json title,body,files` and `gh pr diff n --name-only` when PRE shows `gh`; otherwise ask for a range.

Look only at the diffstat and file types now, just enough to recommend a format:

| Change | Recommend |
|---|---|
| Visible UI change: pages, components, styles, templates, copy | Video |
| Logic, flow, API, integration, background job | Diagram |
| Small visual tweak (a few style or copy files) | Image |
| Large feature touching many areas | All |
| No user-facing effect (refactor, infrastructure) | Diagram, framed as "under the hood" |

## Step 3: Questions (one AskUserQuestion call)

Write question and option text in the user's conversation language; the English here is the canonical meaning. Headers stay as given (≤ 12 chars). Keep the option order fixed. Add "(last used)" to the description of the user's previous answer from PRE `lastUsed`. Skip any question the arguments answered.

1. `Format`: "What should I create for the customer?"
   - `Video`: short MP4 (30–60 s) with animated captions; best for visible UI changes
   - `Image`: 3–5 PNG slides including a one-page summary card; easy to paste into email or WhatsApp
   - `Diagram (Mermaid)`: flow/sequence diagrams as SVG + PNG + editable `.mmd`
   - `All`: everything above in one consistent style
   Append " (Recommended)" to the Step 2 pick.
2. `Save to`: "Where should I save the files?" Each description shows the real path from PRE `savePaths.*.example`.
   - `New folder in project (Recommended)` · `Current folder` · `Desktop` · `Movies folder` (macOS) / `Videos folder` (Windows, Linux), the last only when `savePaths.videos.exists`.
3. `Style`: "Which visual style?" Put in the question text: the preview sheet `${CLAUDE_SKILL_DIR}/styles-preview.png`, and that Other accepts a style from the extended list, brand hex colours, or a website URL to match.
   - `Match my project (Recommended)`: the project's own colours, fonts, radius and logo
   - `Modern SaaS`: shadcn/ui · Vercel · Linear · Stripe
   - `Clean & friendly`: Apple Keynote · Notion · Material 3 · Fluent 2
   - `Bold & creative`: Neo-brutalism · Glassmorphism · Hand-drawn · Retro terminal
4. `Screenshots`: only when the change is visual and the format includes video or images.
   - `Use my running app`: description shows PRE `devServer.recommendedUrl` (or the best `responding` URL); mark Recommended when it responds
   - `Start dev server for me`: description shows PRE `devServer.startCommand` (static sites: "serve the project folder")
   - `No real screenshots`: illustrations and diagrams only
   Other means the user types a URL. With Storybook (PRE `devServer.storybookUrl` or `project.storybook`) prefer stories for isolated component shots.

Without AskUserQuestion (non-interactive run) use the defaults: recommended format, project folder, Match my project, and screenshots only when PRE `devServer.recommendedUrl` responds or the project is a static site (capture.mjs serves the folder itself). List these assumptions in the final report.

Then save the answers: `node "${CLAUDE_SKILL_DIR}/scripts/preflight.mjs" --remember '{"format":"…","saveTo":"…","style":"…","screenshots":"…"}'`.

## Step 4: Brief, storyboard, approval

1. Read `reference/storytelling.md` now.
2. Read the diff in full (`git diff <base>`, `git show <commit>` or `gh pr diff n`), plus the code around it that decides what the user sees: routes, components, copy strings, i18n files. Quote the product's real UI strings.
3. Create the run: `node "${CLAUDE_SKILL_DIR}/scripts/preflight.mjs" --resolve-out <project|cwd|desktop|videos|PATH> --title "<change title>" --lang <code> --audience <customer|technical>`. Keep `src`, `folder` and `layout`.
4. Write `SRC/storyboard.json` and a draft message at `<folder>/<layout.message>` from `templates/message.md.tmpl`. For diagram output read `reference/diagrams.md` and write `SRC/diagrams/<name>.mmd`.
5. When PRE shows `tools.firstRun`, run `node "${CLAUDE_SKILL_DIR}/scripts/setup.mjs" --dry-run` for the download size N.
6. One AskUserQuestion call with up to three questions:
   - `Exact style`, only if a family was chosen: its four styles with one-line descriptions from `styles/<id>.json`. If option `preview` is supported, give each a small monospace swatch: background, text and accent hex, heading font, radius.
   - `Approve`, skipped with `--yes`: `Render it (Recommended)` · `Shorter` · `More detail` · `Change style`; Other takes free-text edits. Put the compact storyboard (scene · seconds · on-screen text · visual) plus scope, language and audience into the `preview` of `Render it`, or into the question text when previews are unavailable. Text printed before the dialog may be hidden.
   - `Setup`, only on first run: "Install the rendering tools once (~N MB)?" `Install (Recommended)` · `Not now`.
7. Apply the answer and ask `Approve` again until the user picks `Render it`.

## Step 5: Produce

1. Toolchain: after `Install`, run `setup.mjs` (tell the user it downloads ~N MB, about a minute). If PRE shows FFmpeg missing, show `tools.ffmpeg.install` and ask; the no-admin fallback is `setup.mjs --ffmpeg-static`. Node below 22 means the Playwright fallback engine (see `reference/video.md`). After `Not now`, deliver what needs no toolchain (storyboard, `.mmd` sources, message) and explain how to render later; go to Step 7.
2. Style:
   - Match my project: `detect-project-style.mjs --project <PRE project.root> --src SRC`, then `theme.mjs --style SRC/style.json --src SRC`. Report what was detected and what was guessed.
   - Catalog style: `theme.mjs --style <id> --src SRC --lang <code>`. Add `--mode light|dark` or `--variant <name>` when asked.
   - Other (extended name, hex colours, URL): read `reference/styles.md`.
   Mention any contrast `adjustments` theme.mjs reports.
3. For each requested output read its reference file and follow it: `reference/capture.md` when screenshots are used, `reference/diagrams.md`, `reference/images.md`, `reference/video.md`. In `All` mode run them in this order: capture, diagrams, stills, video. Scenes are built once from the storyboard; stills and video share them, and a diagram can be a video scene.
4. Before the video, run `render-video.mjs --src SRC --estimate` and tell the user roughly how long it takes.

## Step 6: QA (mandatory)

Run `node "${CLAUDE_SKILL_DIR}/scripts/qa.mjs" --src SRC`. Fix every `errors` item; weigh each warning. Then Read every file in `review`: `glyphs.png`, the contact sheets, every extracted frame, every PNG and every diagram PNG. Look for:

- clipped or overflowing text, overlaps, text over busy backgrounds
- contrast below WCAG AA
- a default serif or other fallback font (the font did not load)
- wrong or missing diacritics (`İıĞğŞşÇçÖöÜü` in `glyphs.png`)
- black, blank or half-animated frames
- leftover placeholders, wrong UI strings, invented claims
- secrets or personal data (emails, names, tokens, internal URLs, other clients)

Fix through the storyboard or style and re-render only what changed, then run qa.mjs again. Stop after 2 fix rounds and report what is left.

## Step 7: Deliver

Final message, in the user's language:

1. The output folder, then each file with path and facts: video duration, resolution and size; image count and resolution; diagram names.
2. The customer message from the message file, ready to paste.
3. Assumptions made (defaults, guessed style tokens, skipped screenshots or outputs) and any failure with its fix.
4. Up to 3 one-line follow-ups, such as "English version", "shorter cut", "vertical 9:16", "dark mode".

If the run's `gitignore` (from `--resolve-out`) shows `inRepo` and not `ignored`, offer to add its `entry` to `.gitignore` in `repoRoot`. Change `.gitignore` only after the user says yes.

Tweaks later are cheap: edit `SRC/storyboard.json` or the message, re-run only the affected render script, then qa.mjs. A style switch is `theme.mjs` followed by the render scripts.
