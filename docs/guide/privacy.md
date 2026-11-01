# Privacy and honesty

## What never goes on screen

- secrets: `.env` values, API keys, tokens, passwords
- internal hostnames, IP addresses, `localhost` URLs and stack traces
- real customer data and the names of your other clients
- file names, function names and commit hashes, unless you ask for `audience=technical`

Screenshots use demo data. Emails, phone numbers, card numbers, tokens and password fields are covered automatically, and you can mask more by selector. The QA script scans every on-screen string and the message for the obvious patterns; Claude checks the rest by looking at each frame.

## What is never invented

The skill describes only what the diff shows. It does not make up features, numbers, dates or screens. Visuals that are not real screenshots stay clearly illustrative, and limitations and required actions are stated plainly, including "nothing to do on your side".

## Your project stays untouched

The skill reads your project and writes only into the output folder and its own tool cache. It never edits, commits, stashes or pushes your code and never installs dependencies into your project. A "before" screenshot uses a temporary git worktree that is removed afterwards.

## Network

Rendering is local. The first run downloads the tools once. Telemetry in HyperFrames is turned off. The `skills` CLI you install with sends anonymous install counts for public repositories; set `DISABLE_TELEMETRY=1` to turn that off.
