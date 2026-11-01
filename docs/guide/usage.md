# Usage

```
/explain-to-customer [scope] [format] [style=…] [out=…] [lang=…] [audience=technical] [--yes]
```

Every argument is optional. Anything you pass is never asked again.

## Examples

```
/explain-to-customer
/explain-to-customer HEAD~3..HEAD video style=apple out=desktop
/explain-to-customer PR#42 all lang=en --yes
/explain-to-customer "Invoices are now emailed automatically" diagram style=executive
/explain-to-customer image style=#E11D48,#0EA5E9
```

## Arguments

| Argument | What it does |
|---|---|
| `a1b2c3d`, `HEAD~2`, `main..HEAD` | Explain a commit or a range |
| `PR#42` or `#42` | Explain a pull request (needs the GitHub CLI) |
| `"what changed"` | Describe the change in words, for example outside a git repo |
| `video`, `image`, `diagram`, `all` | What to create |
| `style=` | A style id or name, `match`, brand hex colours, or a website URL |
| `out=` | `project`, `cwd`, `desktop`, `videos` or any path |
| `lang=` | Language of everything the customer sees, for example `en` or `tr` |
| `audience=technical` | Allows technical terms and code-level diagrams |
| `--yes` | Skip the storyboard approval and use defaults for anything open |

## What it explains by default

Without a scope, the skill picks:

1. on a feature branch, everything since it left the default branch, plus uncommitted work;
2. on the default branch, your uncommitted changes;
3. otherwise, the last commit.

It recommends a format from the kind of change: video for visible UI changes, a diagram for logic and integrations, images for small visual tweaks, everything for large features.

## Where files go

| `out=` | Folder |
|---|---|
| `project` | `<project>/customer-explainers/<date>-<slug>/` |
| `cwd` | Straight into the current folder, sources in the tool cache |
| `desktop` | Your Desktop, following OneDrive and localized folder names |
| `videos` | Movies on macOS, Videos on Windows and Linux |
| a path | That folder, or a new subfolder if it already has files |

Existing folders are never overwritten; a new run gets `-2`, `-3` and so on. If the output folder is inside your repo and not ignored, the skill offers to add it to `.gitignore`.

## Tweaks after delivery

Every run keeps a `_source/` folder with the storyboard, scenes and diagram sources. Ask for a shorter cut, another language or another style, and only the affected outputs are rendered again.
