# Plugin icon

`app-icon.png` is copied unchanged from the Codex atlassian-rovo plugin in
[openai/plugins](https://github.com/openai/plugins/tree/1dc195897af4161d039b80d8471ec0a10c9bbc89/plugins/atlassian-rovo).

- Upstream plugin version: `1.0.6`
- Upstream commit: `1dc195897af4161d039b80d8471ec0a10c9bbc89`
- Asset: [`assets/app-icon.png`](https://raw.githubusercontent.com/openai/plugins/1dc195897af4161d039b80d8471ec0a10c9bbc89/plugins/atlassian-rovo/assets/app-icon.png) (`interface.composerIcon`)
- Upstream author: Atlassian
- Upstream plugin manifest license declaration: MIT
- SHA-256: `83d4e0c0b61edf7bd50a51a937b4d1abf72616a3366921c879748937806a7f55`

This brand asset identifies the connected service. The Skill and manifests are
independently authored. No upstream Skill, `.mcp.json`, `.app.json`, client id,
or client secret is copied.

`plugin.json` embeds the same bytes in `extensions.xpertai.interface.icon` as
a data URL. Preserve the asset bytes and update the data URL together when
replacing the icon.
