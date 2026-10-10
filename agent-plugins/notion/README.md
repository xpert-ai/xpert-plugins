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
still apply. Tool names and availability come from the live server. This host
uses hosted names such as `notion-search` and `notion-fetch`, not the OpenAI
client aliases `search` and `fetch`.

Skills:

- `notion-workspace` — general search, read, and requested writes.
- `notion-knowledge-capture` — conversations and decisions into structured pages.
- `notion-meeting-intelligence` — meeting preparation from workspace context.
- `notion-research-documentation` — research briefs and reports in Notion.
- `notion-spec-to-implementation` — specs turned into implementation tasks.

The four specialized skills are ported from
[`openai/plugins` commit `1dc195897af4161d039b80d8471ec0a10c9bbc89`](https://github.com/openai/plugins/tree/1dc195897af4161d039b80d8471ec0a10c9bbc89/plugins/notion/skills),
including their reference, example, and evaluation files. `agents/openai.yaml`
was not copied. Notion Labs' MIT notice stays beside each ported skill.

Version 1.2.0 keeps `xpertai.connectors.notion` as the generic MCP OAuth Connector
and adds those four skills. Publish a new binding for 1.2.0. Do not silently
replace a conversation that is still pinned to 1.1.0 or an older package.
`--replace` migrates the workspace binding and leaves old conversation pins in
place. Authorize the Connector once; later package versions with the same
endpoint reuse that connection.
