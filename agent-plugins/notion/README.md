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

## 可用性测试说明

没有 Notion 用户授权时，不能读取私人页面。不要在对话里索要或粘贴 token。

1. 打包：`corepack pnpm quickstart --pack --output-dir /tmp/xpert-agent-plugins notion`
   确认 ZIP 版本是 1.2.0，并且包含四个移植技能目录和原来的 `notion-workspace`。
2. 发布新绑定。已有 1.1.0 时使用安装器的 `--replace` 只迁移工作区绑定。打开一个仍固定在旧版本的会话，确认它没有被换成 1.2.0。
3. 用户在插件详情连接 Notion。已有同一端点的 Connector 时，不需要重新发明客户端；按界面完成授权即可。
4. 只读冒烟：
   - 「用 `notion-search` 搜索我指定的页面标题。」
   - 「用 `notion-fetch` 打开刚才的结果，不要新建或修改页面。」
   - 期望结果含页面链接。不要把搜索到的外部 URL 传给 `notion-fetch`。
5. 技能冒烟（仍不写）：
   - `notion-workspace`：「总结我指定的路线图页面。」
   - `notion-knowledge-capture`：「如果要把这段笔记收成 wiki，应该落到哪个数据库？先搜索，不要创建页面。」
   - 对其余三个技能各做一次「先搜索或读取、明确不要创建任务、评论或数据库」的提问。
6. 写冒烟只在测试者指定一个可丢弃的父页面并明确要求创建时进行。创建后用 `notion-fetch` 读回。
7. 没有凭证时不能验证：同意与撤销、私人页面、四个工作流的真实写入，以及 Notion 是否临时隐藏某个工具。实时 schema 与本包中的工具名不一致时，以实时 schema 为准。
