# Notion for Xpert

An Xpert-authored Agent Plugins 1.0.0 package for the official
[Notion MCP server](https://developers.notion.com/guides/mcp/build-mcp-client).
It is not the OpenAI-hosted Notion connector or a Notion-published package.

Import this directory and publish to the permitted workspace. The manifest declares
**workspace Connector OAuth** for the `notion` MCP component automatically.
Each user opens the plugin details, connects Notion, and grants access to their
workspace. No shared credential or pre-registered OAuth app is bundled.

Try: "Use Notion to search for the project roadmap and summarize it with links."
The server can also expose write tools; user permissions and Xpert tool approval
still apply. Tool names and availability come from the live server.

Version 1.1.0 declares `cn.xpertai.connectors.notion` for the generic MCP OAuth Connector. Use the installer `--replace` option to migrate an existing legacy binding; old conversations keep the old version. Authorize the new Connector once; subsequent matching package versions reuse it.
