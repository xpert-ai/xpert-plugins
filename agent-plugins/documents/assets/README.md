# Plugin icon

`icon.png` is copied unchanged from OpenAI's Codex Documents plugin.

- Upstream bundle: `openai-primary-runtime/documents/26.909.12148`
- Asset: `assets/icon.png` (the upstream `interface.composerIcon`)
- Upstream author: OpenAI
- Upstream plugin manifest license declaration: MIT
- SHA-256: `fe53827628afc66036a3fe0281674ab40957c9ad3daad69d7c86ac015200003c`

This third-party icon is separate from the independently authored Xpert Skill and
runtime. No upstream Skill files or private runtime are included.

`plugin.json` embeds these same PNG bytes as the
`extensions["xpertai"].interface.icon` data URL, so the installed resource can
display its icon without a local asset URL or external image server. If the PNG
is replaced, regenerate that data URL from the new file.
