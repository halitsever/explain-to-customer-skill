# Images

Read when the format includes images.

## What to produce

3–5 PNG slides at 1920×1080, rendered at device scale factor 2 (3840×2160 files), into `<folder>/<layout.images>/`:

- `01-summary.png`: the `summary-card` scene. It must stand on its own when forwarded: title, 3 short points, one key visual (an annotated screenshot or a before/after pair), and "what you need to do".
- `02-…` to `05-…`: the most useful content scenes, usually before-after, screenshot-callouts, steps, benefits or diagram. Title and outro scenes add nothing as stills.

Choose and order them with `meta.images` (scene ids). Without it, the script takes the summary card plus the first four content scenes.

## Command

```
node "${CLAUDE_SKILL_DIR}/scripts/render-stills.mjs" --src SRC
```

Flags: `--only summary,after` (re-render some), `--scale 1` (smaller files), `--force` (rebuild scenes from the storyboard).

The stills come from the same scene HTML as the video. The script bakes every scene first (fonts, text fitting, rough outlines), so stills and video always match. In `All` mode render diagrams first so diagram scenes have their PNG, then stills, then video.

## Output JSON

`files` lists each PNG; `issues` lists font fallbacks (`font-fallback`), text still overflowing at minimum size (`text-overflow`), content outside the safe area (`safe-area`), missing images (`missing-image`) and page errors. Fix them in the storyboard and re-run.

## Key visuals

- Prefer a real annotated screenshot from capture.mjs (`assets/<name>.png`) as the summary card's `assets[0]`.
- Without screenshots the summary card shows a before/after pair from `brief.before` and `brief.after`. Abstract shapes are the last resort.
- Never draw something that looks like product UI but is not a screenshot.

## Sharing notes

WhatsApp recompresses images; the 3840×2160 PNGs survive that well. For email, 01-summary.png alone is often enough; mention the others as attachments in the message.
