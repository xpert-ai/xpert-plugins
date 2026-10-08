# Plugin icon

`icon.svg` is copied unchanged from the Codex linear plugin in
[openai/plugins](https://github.com/openai/plugins/tree/1dc195897af4161d039b80d8471ec0a10c9bbc89/plugins/linear).

- Upstream plugin version: `5.0.1`
- Upstream commit: `1dc195897af4161d039b80d8471ec0a10c9bbc89`
- Asset: [`assets/composer-icon.svg`](https://raw.githubusercontent.com/openai/plugins/1dc195897af4161d039b80d8471ec0a10c9bbc89/plugins/linear/assets/composer-icon.svg) (`interface.composerIcon`)
- Upstream author: Linear Orbit, Inc
- Upstream plugin manifest license declaration: MIT
- SHA-256: `6699a52fa24d4b802674d0178fd2c4aba9db3a80dde33c7dea9ef963fa96a3ab`

This brand asset identifies the connected service. It is separate from the
independently authored Xpert preset; no upstream Skill or runtime code is copied.

`plugin.json` embeds the same bytes in
`extensions.xpertai.interface.icon` as a data URL, so the imported package
does not need an external image request. Preserve the asset bytes and update
the data URL together when replacing the icon.
