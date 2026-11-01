# Getting started

explain-to-customer is an agent skill for [Claude Code](https://github.com/anthropics/claude-code). You finish a change, type `/explain-to-customer`, and get a folder you can send to your client: a short video, a few slides, Mermaid diagrams and a message, in the visual style you pick.

## Requirements

- Claude Code
- Node.js 22 or newer. Older versions work with a slower video engine.
- FFmpeg: `brew install ffmpeg`, `winget install Gyan.FFmpeg` or `sudo apt install ffmpeg`. Without admin rights the skill can install a static build into its own cache.
- git. The GitHub CLI is optional and only needed for `PR#123` scopes.

macOS, Windows, Linux and WSL are supported.

## Install

Install it with the [skills](https://github.com/vercel-labs/skills) CLI:

```bash
npx skills add halitsever/explain-to-customer -g -a claude-code
```

`-g` installs it for your user so it works in every project; leave it out to install into the current project only. `-a claude-code` skips the agent picker.

Update or remove it later:

```bash
npx skills update explain-to-customer -g
npx skills remove explain-to-customer -g
```

::: details Manual install with git
```bash
# macOS / Linux
git clone https://github.com/halitsever/explain-to-customer ~/explain-to-customer
ln -s ~/explain-to-customer/skills/explain-to-customer ~/.claude/skills/explain-to-customer
```

```powershell
# Windows (PowerShell)
git clone https://github.com/halitsever/explain-to-customer "$env:USERPROFILE\explain-to-customer"
Copy-Item -Recurse "$env:USERPROFILE\explain-to-customer\skills\explain-to-customer" "$env:USERPROFILE\.claude\skills\"
```

Update with `git pull` in the clone. On Windows, copy the folder again afterwards.
:::

If `~/.claude/skills` did not exist before you installed, run `/reload-skills` once in Claude Code.

## First run

The first time you use it, the skill asks before installing its rendering tools once: about 250 MB of downloads (npm packages and a headless Chromium, skipped when Playwright already has one). They go into a cache folder, never into your project:

| OS | Tool folder |
|---|---|
| macOS, Linux | `~/.cache/explain-to-customer` |
| Windows | `%LOCALAPPDATA%\explain-to-customer` |

If you choose not to install yet, you still get the storyboard, the Mermaid sources and the message.

## Your first explainer

Open Claude Code in a project with a change you want to show, then:

```
/explain-to-customer
```

It works out what changed, asks four questions (what to make, where to save it, which style, whether to take screenshots), shows you the storyboard, renders, checks every frame and hands you the folder. [Usage](./usage) lists every argument.
