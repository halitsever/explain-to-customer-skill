# Video

Read when the format includes video.

## Pipeline

`render-video.mjs` does all of this in one run:

1. Builds `SRC/scenes/NN-<id>.html` from `storyboard.json` (only scenes whose file is older than the storyboard, unless `--force`).
2. Bakes each scene in Chromium: waits for fonts, shrinks text that overflows, draws rough outlines for hand-drawn styles, and writes the result back into the scene file.
3. Saves the title scene as `<slug>-poster.png`.
4. Assembles `SRC/video/index.html`, a HyperFrames composition: each scene is a `.clip` with `data-start`/`data-duration`, and one paused GSAP timeline is registered on `window.__timelines.main`. GSAP, fonts and assets are copied locally; nothing loads from a CDN.
5. Renders with the HyperFrames CLI from the tool workspace (local Chrome + FFmpeg, telemetry off, Playwright's Chromium shared through `HYPERFRAMES_BROWSER_PATH`).
6. Verifies H.264, `yuv420p`, 1920×1080, 30 fps; remuxes with `+faststart` and no audio track; transcodes only when the render misses the target; re-encodes at CRF 24 then 28 when over 25 MB.
7. Writes `<slug>-preview.gif`: 960 px, 12 fps, palettegen/paletteuse. Over 10 MB it retries at 10 fps and 800 px, then trims to 15 s, then skips and says so.

## Commands

```
node "${CLAUDE_SKILL_DIR}/scripts/render-video.mjs" --src SRC --estimate
node "${CLAUDE_SKILL_DIR}/scripts/render-video.mjs" --src SRC
```

Flags: `--engine hyperframes|playwright` (default auto), `--no-gif`, `--force` (rebuild every scene from the storyboard), `--verbose` (stream HyperFrames logs).

Timing: about 10 s plus 0.6 s per second of video with HyperFrames on Apple Silicon; the Playwright fallback takes about 3 s per second of video. Tell the user the `--estimate` number before rendering.

## Motion

Motion comes from the style (`motion.entrance`, duration, easing, stagger) through `tokens.css`; templates never hard-code it. Entrances: `fade`, `fade-up`, `blur-in`, `pop`, `slide`, `typewriter` (terminal), `draw` (whiteboard strokes draw themselves), `wipe`. Every scene except the last fades out in its final 0.4 s; `"transition": "cut"` skips that. Screenshots get a slow 3.5 % zoom. The opening headline is visible on frame 0 because players and mail clients use it as the thumbnail.

## Editing

- Wording, order or timing: edit `storyboard.json`, re-run render-video.mjs.
- Layout of one scene: edit its `SRC/scenes/NN-<id>.html` between the `<!--scene:start-->` markers and add `data-keep` to its `<section>` so later storyboard edits do not overwrite it. Use only classes from `lib/base.css` and CSS variables from `tokens.css`, so a style switch still works.
- Style switch: `theme.mjs --style <id> --src SRC`, then re-render. Scenes pick up the new tokens without a rebuild.

## Fallback engine

Used automatically when Node is older than 22, HyperFrames is missing, or the HyperFrames render fails (the JSON `warnings` says why). It opens the same composition in Playwright, seeks the paused timeline frame by frame (`window.__etc.seek(t)`), takes a screenshot per frame and pipes them to FFmpeg. It is deterministic; it never records the screen in real time.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `FFmpeg/ffprobe not found` | Show PRE `tools.ffmpeg.install`; no admin rights: `setup.mjs --ffmpeg-static` |
| HyperFrames cannot launch Chrome | `setup.mjs` (re)downloads the Playwright headless shell; the JSON names the browser path in use |
| `font-fallback` issue | The font is not in the tool workspace: `setup.mjs --add-font "<Family>"`, re-run theme.mjs |
| `safe-area` or `text-overflow` issue | Shorten the text in the storyboard; the baker already shrank it to the minimum size |
| Blank first or last frame in QA | Check the first scene is a `title` with a heading; check `transition` values |
| Video over 25 MB | Usually long screenshot scenes; shorten scenes or use fewer full-screen screenshots |

Remotion is not used: its license requires a paid company license for for-profit companies with 4 or more people.
