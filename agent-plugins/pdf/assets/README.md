# Plugin icon

`icon.png` is copied unchanged from OpenAI's Codex PDF plugin.

- Upstream bundle: `openai-primary-runtime/pdf/26.909.12148`
- Asset: `assets/icon.png` (the upstream `interface.composerIcon`)
- Upstream author: OpenAI
- Upstream plugin manifest license declaration: MIT
- SHA-256: `ec784d80676cac375282bd9f3331ac6de6e41746b354b9488a038f6d87335396`

This third-party icon is separate from the independently authored Xpert Skill and
runtime. No upstream Skill files or private runtime are included.

`plugin.json` embeds these same PNG bytes as the
`extensions["xpertai"].interface.icon` data URL, so the installed resource can
display its icon without a local asset URL or external image server. If the PNG
is replaced, regenerate that data URL from the new file.
