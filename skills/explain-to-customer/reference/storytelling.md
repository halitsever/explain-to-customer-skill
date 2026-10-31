# Storytelling: brief, storyboard, words

Read this before writing `storyboard.json` or the message. Everything the customer sees comes from these two files.

## 1. Find the story

1. List what changed for the person using the product. Ignore internal renames, tests and tooling unless they change behaviour.
2. Big or mixed diffs: keep the 1–3 most customer-relevant changes. If it is unclear which ones matter, ask the user one question.
3. No user-facing effect (refactor, upgrade, infrastructure): say so plainly and tell an "under the hood" story about reliability or maintainability: one diagram, a short message. Never invent metrics.
4. Collect the real words: button labels, headings, error messages and menu names from components and i18n files. Quote them exactly, in the product's language.

## 2. Change brief

`storyboard.json` → `brief`:

| Field | Content |
|---|---|
| `title` | ≤ 8 words, benefit first ("Clearer error messages on sign-up", not "Refactor form validation") |
| `summary` | One sentence a busy client reads in 5 seconds |
| `before` | What the customer's users experienced before |
| `after` | What they experience now |
| `where` | Where in the product, in the product's own words (page, menu) |
| `steps` | How to use it, 1–4 short imperative steps, or `[]` |
| `customerAction` | What the client must do (enable a setting, tell their team, nothing). Say "nothing" when nothing |
| `limitations` | Known gaps, follow-ups, rollout caveats. `[]` when none |

## 3. Audience and language

- Default audience is non-technical (`audience: "customer"`). Plain words, benefits first. On screen: no file or function names, commit hashes, framework names or jargon such as endpoint, refactor, merge, deploy, cache.
- `audience=technical` allows precise terms and code-level diagrams (`erDiagram`, API sequence), still without secrets.
- Language: the user's conversation language unless `lang=` is given. Show it in the approval preview so the user can change it. Write UI strings exactly as the product shows them, even when the rest is in another language.
- Labels shown on scenes ("Before", "Now", "What you need to do") come from `meta.labels`. Built in: tr, en, de, fr, es, it, nl, pt. For any other language set all four: `{"before": "…", "after": "…", "action": "…", "none": "…"}`.

## 4. Honesty

- Never invent features, numbers, dates, customer names or UI. If a benefit needs a number you do not have, describe the benefit without one.
- A visual that is not a real screenshot must look illustrative: icons, abstract shapes, diagrams. It must never imitate product UI. Scene templates already follow this; do not hand-build fake screens.
- State limitations and required actions plainly. "Nothing to do on your side" is a fine answer.

## 5. Privacy

Check every on-screen string and the message before rendering:

- No secrets: `.env` values, API keys, tokens, passwords, connection strings.
- No internal hostnames, IPs, `localhost` URLs, staging URLs, stack traces, file paths.
- No real customer data and no other clients' names. Screenshots use seed or demo data; capture.mjs masks what looks personal.
- `qa.mjs` checks the obvious patterns. It cannot know which names are real; you can.

## 6. Video pacing

- 30–60 s, hard maximum 90 s; 4–7 scenes. A one-line fix can be 20 s.
- Each caption line ≤ 12 words, at most 2 lines per text block, on screen ≥ 2.5 s, about 3 words per second plus a second to look at the visual.
- Silent video: the on-screen text is the narration. No audio, no flashing.
- Templates enforce headings ≥ 64 px, body ≥ 36 px, 5 % safe margins and AA contrast.
- Typical arc: Title → Before (the problem) → After (the change, real UI when available) → How it works (diagram) → How to use (steps) → What you need to do → Outro. Drop scenes that add nothing.

## 7. storyboard.json

```json
{
  "meta": {
    "title": "Clearer error messages on sign-up",
    "slug": "clearer-error-messages-on-sign-up",
    "scope": "feature/signup-errors: 3 commits since main",
    "lang": "en",
    "audience": "customer",
    "style": "shadcn",
    "format": "all",
    "durationS": 28,
    "product": "Acme Portal",
    "date": "1 November 2026",
    "logo": "brand/logo.svg",
    "images": ["summary", "after", "steps"],
    "labels": { "before": "Before", "after": "Now", "action": "What you need to do", "none": "Nothing to do on your side." }
  },
  "brief": { "title": "…", "summary": "…", "before": "…", "after": "…", "where": "…", "steps": ["…"], "customerAction": "…", "limitations": [] },
  "scenes": [
    { "id": "title", "type": "title", "durationS": 4, "onScreenText": ["Clearer **error messages** on sign-up", "Your users see exactly what to fix"], "visual": "Title card", "assets": [], "transition": "fade", "notes": "" }
  ]
}
```

- `meta.product` is the customer-facing product name (not the repo name). `meta.date` is display text in the customer's language. `meta.logo` only points to a logo from the repo (detect-project-style copies it to `brand/`).
- `meta.images` lists scene ids for stills, in order; default is the summary card plus up to four content scenes.
- `**word**` in any on-screen text becomes an accent highlight (a marker stroke in the whiteboard style). Use it once or twice per video.
- `assets` paths are relative to `_source` (`assets/after-errors.png`, `diagrams/flow.scene.png`) or absolute (copied in).
- `transition`: `fade` (default) or `cut`. `notes` is for you and is never rendered.

### Scene types

`onScreenText[0]` is the heading. The rest depends on the type:

| type | onScreenText[1..] | data | assets |
|---|---|---|---|
| `title` | subtitle | `eyebrow` (defaults to product) | |
| `before-after` | | `before: {text, label?, image?}`, `after: {…}` | images go inside `before`/`after` |
| `screenshot-callouts` | one line per numbered callout, matching the screenshot's numbers | | `[annotated screenshot]` |
| `steps` | 1–4 steps | | |
| `diagram` | optional caption | | `["diagrams/<name>.scene.png"]` |
| `benefits` | 1–4 benefits | | |
| `action-needed` | 1–4 actions | `none: true` for "nothing to do" (then `[1]` is the sentence) | |
| `outro` | second line | `eyebrow` | |
| `summary-card` | 3 points | `action`, `actionLabel`, `before`, `after` (default from brief) | `[key visual]`, else a before/after pair |

`summary-card` never appears in the video. Add it whenever the format includes images; it becomes `01-summary.png` and must stand on its own: title, 3 short points, key visual, what the customer needs to do.

## 8. message.md

Use `templates/message.md.tmpl`, in the customer's language:

- Subject line.
- Greeting with the `[Customer name]` placeholder (translate the placeholder text with the language, for example `[Müşteri adı]`).
- 2–4 sentence summary, benefit first.
- "What's new" bullets.
- "What you need to do" (or that nothing is needed).
- Attached files, by file name.
- Sign-off with `[Your name]`.

Keep it short enough to read on a phone. No jargon, no internal links, no invented dates.
