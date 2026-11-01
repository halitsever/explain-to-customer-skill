# Troubleshooting

### `/explain-to-customer` is not found
Run `/reload-skills`, or start a new Claude Code session. Check that `~/.claude/skills/explain-to-customer/SKILL.md` exists.

### FFmpeg is missing
Install it with `brew install ffmpeg`, `winget install Gyan.FFmpeg` or `sudo apt install ffmpeg`. Without admin rights, let the skill install a static build into its tool folder.

### "Operation not permitted" when saving to the Desktop or Movies on macOS
Allow your terminal app in System Settings → Privacy & Security → Files and Folders, then run it again.

### A font falls back to a default one
The style's font is not in the tool folder yet. The skill installs it from Fontsource and renders again. Every font is checked for your language's letters before rendering.

### The video is over 25 MB
Long full-screen screenshot scenes make videos large. The skill re-encodes it smaller automatically; shorter scenes or fewer screenshots help more.

### My app needs a login for screenshots
Give the skill a local test account or a public route when it asks. It never uses real customer credentials, and the credentials file is deleted after the capture.

### I want the storyboard without rendering
Answer "Not now" to the setup question, or pick only `diagram`. You still get the storyboard, the Mermaid sources and the message.
