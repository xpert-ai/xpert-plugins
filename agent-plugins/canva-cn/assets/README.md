# Plugin icon

`icon.png` is copied unchanged from the Codex canva plugin in
[openai/plugins](https://github.com/openai/plugins/tree/1dc195897af4161d039b80d8471ec0a10c9bbc89/plugins/canva).

- Upstream plugin version: `14.0.0`
- Upstream commit: `1dc195897af4161d039b80d8471ec0a10c9bbc89`
- Asset: [`assets/logo.png`](https://raw.githubusercontent.com/openai/plugins/1dc195897af4161d039b80d8471ec0a10c9bbc89/plugins/canva/assets/logo.png) (`interface.logo`)
- Upstream author: Canva Pty Ltd.
- The upstream plugin manifest does not declare a license.
- SHA-256: `afb54276bf45167125048872621a14156c03034484519d81b5160cb73c2d7c20`

This brand asset identifies the connected service. It is separate from the
independently authored Xpert preset; no upstream Skill or runtime code is copied.

`plugin.json` embeds the same bytes in
`extensions.xpertai.interface.icon` as a data URL, so the imported package
does not need an external image request. Preserve the asset bytes and update
the data URL together when replacing the icon.

The Canva brand icon is shared; this preset continues to use Canva China MCP.
