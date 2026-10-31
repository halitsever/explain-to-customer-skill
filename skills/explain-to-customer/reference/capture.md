# Capture: screenshots of the running app

Read when the user chose real screenshots. capture.mjs drives Playwright: viewport 1440×900 at device scale 2, waits for network idle and fonts, masks personal data, draws numbered highlight boxes and places the shot in a neutral, unbranded browser frame.

## 1. Which URL

- `Use my running app`: PRE `devServer.recommendedUrl` responds on the port this project expects. Other `responding` entries may belong to another project; check their `title` before using one.
- `Start dev server for me`: put PRE `devServer.startCommand` into the plan's `serve.command` with `serve.url`. capture.mjs starts it, waits until it answers, and stops it (with its child processes) when done.
- Static site without a dev server (PRE `project.staticSite`): `"serve": {"static": "<project root>"}`; add `"spa": true` for single-page apps.
- Other: the URL the user typed.
- Storybook: for an isolated component, shoot `/iframe.html?id=<story-id>&viewMode=story` on the Storybook URL. Story ids are in the `*.stories.*` files.

## 2. Login

If a page needs login, ask the user for a local test account or a public route. Never use real customer credentials. Put the test credentials in a temporary JSON file outside the project and pass `--secrets <file>`; reference them in actions as `${secret.user}` and `${secret.pass}`. The file is deleted after the run.

## 3. Plan file

Write `SRC/capture.json`:

```json
{
  "baseUrl": "http://localhost:5173",
  "serve": { "command": "npm run dev", "cwd": "<project root>", "url": "http://localhost:5173", "timeoutS": 90 },
  "projectRoot": "<project root>",
  "viewport": { "width": 1440, "height": 900 },
  "dpr": 2,
  "addressBar": "app.acme.com/signup",
  "allowText": ["name@company.com"],
  "shots": [
    {
      "name": "after-errors",
      "path": "/signup",
      "actions": [
        { "fill": ["#email", "maria@example.com"] },
        { "fill": ["#password", "123"] },
        { "click": "button[type=submit]" },
        { "waitFor": ".field-error" }
      ],
      "highlights": [ { "selector": "#email" }, { "selector": ".field-error" }, { "selector": "#retry" } ],
      "mask": [".user-menu"],
      "clip": "form",
      "clipPadding": 16
    }
  ],
  "before": { "ref": "main", "shots": ["after-errors"] }
}
```

- `actions`: `click`, `fill`, `type`, `press`, `hover`, `check`, `select`, `waitFor`, `wait` (ms, max 10 000), `scrollTo`, `goto`.
- `highlights` get numbered boxes in the style's accent colour; numbers follow the list order unless a `label` is given. Badges sit outside the box so they never cover text. Keep it to 1–4.
- `clip` crops to an element plus `clipPadding` (default 16 px); `fullPage: true` takes the whole page. Crop to the changed component, not the page around it: a scene shows the shot at roughly 1000×800 px, so UI text in a full 1440 px page ends up too small to read. Aim for UI text of at least 20 px in the final scene.
- `addressBar`: the public product domain or nothing. Never `localhost`, IPs or staging hosts. `"frame": false` drops the browser frame.
- Fill forms with demo data (`example.com` addresses, obviously fake names).

Run:

```
node "${CLAUDE_SKILL_DIR}/scripts/capture.mjs" --plan SRC/capture.json --src SRC
```

Output: `SRC/assets/<name>.png` (annotated, framed) and `<name>.raw.png`. The JSON lists each shot, how many elements were masked, and any highlight selector that matched nothing.

## 4. Masking

- Automatic: text and input values that look like emails, phone numbers, card or IBAN numbers, tokens or long keys, plus every password field, are covered with a solid block in the style's muted colour. `example.com`-style addresses stay visible.
- Product copy that only looks personal (an example address inside an error message) goes in `allowText`, or it gets masked too.
- `mask`: selectors to cover explicitly (avatars, customer names, account ids, other clients' data).
- `"autoMask": false` on a shot turns the automatic pass off; only do that for pages with demo data only.
- Look at every captured PNG before using it. Masking is a safety net, not a guarantee.

## 5. Before and after

A real "before" screenshot is optional. capture.mjs takes it from a temporary `git worktree` of `before.ref` in the OS temp folder, links the project's `node_modules`, serves it with the same `serve` settings (or `before.serve`), and removes the worktree afterwards. The user's working tree is never stashed or checked out.

- `before.shots` limits which shots get a before version; their files are `before-<name>.png`.
- The old UI often needs different steps: give the shot `beforeActions` and `beforeHighlights`.
- If the old revision does not run (changed dependencies, migrations), skip it and show "before" as a text card in the before-after scene.

## 6. Using shots in the storyboard

- `screenshot-callouts` scene: `assets: ["assets/after-errors.png"]`, `onScreenText: [heading, callout 1, callout 2, …]` with one line per numbered highlight, same order.
- `before-after` scene: `data.before.image: "assets/before-after-errors.png"`, `data.after.image: "assets/after-errors.png"`.
- `summary-card`: `assets: ["assets/after-errors.png"]` as the key visual.
