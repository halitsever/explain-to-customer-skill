# How it works

## A run, step by step

1. **Preflight.** A script collects your OS, the git scope, the save folders, a running dev server and which tools are installed, as JSON.
2. **Questions.** One dialog: what to make, where to save it, which style, and whether to screenshot your app.
3. **Storyboard.** Claude reads the diff and the code around it (routes, components, copy, translation files) and writes a change brief, the scenes and the message.
4. **Approval.** You see the storyboard and can render it, shorten it, add detail or change the style.
5. **Render.** Screenshots, diagrams, slides and video, all on your machine.
6. **QA.** Every output is checked, then Claude looks at each frame and fixes what is off, at most twice.
7. **Delivery.** You get the folder, the message and a few follow-up ideas.

## Rendering

- **Scenes** are HTML templates driven only by CSS variables, so a style switch is a re-render, not a rewrite. Text that would overflow is shrunk to fit before anything is captured.
- **Video** is a [HyperFrames](https://github.com/heygen-com/hyperframes) composition animated with GSAP and rendered deterministically in headless Chrome with FFmpeg. Without Node 22 or HyperFrames, a Playwright engine seeks the same timeline frame by frame instead.
- **Slides** are screenshots of the same scenes at twice the resolution.
- **Diagrams** go through mermaid-cli with the style's colours converted to hex and the fonts embedded with their licences.
- **Screenshots** come from Playwright: numbered callouts, a neutral browser frame, masked personal data, and an optional "before" shot from a temporary git worktree.

Everything runs locally. Telemetry in the rendering tools is switched off and nothing is uploaded.

## The tool folder

Rendering tools live in their own cache folder with pinned versions: HyperFrames, Playwright with one shared Chromium, mermaid-cli, GSAP, culori, rough.js and the open fonts each style needs. Your project's dependencies and lockfiles are never touched.
