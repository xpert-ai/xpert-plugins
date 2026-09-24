# Plugin icon

`icon.png` is copied unchanged from the Codex sentry plugin in
[openai/plugins](https://github.com/openai/plugins/tree/1dc195897af4161d039b80d8471ec0a10c9bbc89/plugins/sentry).

- Upstream plugin version: `0.1.2`
- Upstream commit: `1dc195897af4161d039b80d8471ec0a10c9bbc89`
- Asset: [`assets/sentry.png`](https://raw.githubusercontent.com/openai/plugins/1dc195897af4161d039b80d8471ec0a10c9bbc89/plugins/sentry/assets/sentry.png) (`interface.logo`)
- Upstream author: OpenAI
- Upstream plugin manifest license declaration: MIT
- SHA-256: `b61e0534635a275cf56f7dad26ac7cc36504b7bd9a60c95791d6e72634129fb1`

This brand asset identifies the connected service. It is separate from the
independently authored Xpert preset; no upstream Skill or runtime code is copied.

`plugin.json` embeds the same bytes in
`extensions.xpertai.interface.icon` as a data URL, so the imported package
does not need an external image request. Preserve the asset bytes and update
the data URL together when replacing the icon.
