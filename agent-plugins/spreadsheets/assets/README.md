# Plugin icon

`icon.png` is copied unchanged from OpenAI's Codex Spreadsheets plugin.

- Upstream bundle: `openai-primary-runtime/spreadsheets/26.909.12148`
- Asset: `assets/icon.png` (the upstream `interface.composerIcon`)
- Upstream author: OpenAI
- Upstream plugin manifest license declaration: MIT
- SHA-256: `0d8e1d3a2a780ebb185a803dce70a1140f0edf076c044688bb511e2ffd820a79`

This third-party icon is separate from the independently authored Xpert Skill and
runtime. No upstream Skill files or private runtime are included.

`plugin.json` embeds these same PNG bytes as the
`extensions["xpertai"].interface.icon` data URL, so the installed resource can
display its icon without a local asset URL or external image server. If the PNG
is replaced, regenerate that data URL from the new file.
