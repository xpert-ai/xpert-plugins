# Canva 可画 Connector

XpertAI 的 Canva 可画连接器插件。它为每位 workspace 用户保存独立 OAuth 凭据，通过中国区 Canva MCP 提供受控的设计检索、读取、设计生成、编辑事务和导出工具。设计生成会返回可信的 Canva 打开链接，用户可选择一个结果并在 Canva 中继续编辑。

新建连接只保留 `Canva 可画中国区 MCP OAuth` 认证。组织管理员预先配置系统集成；连接器会自动查找当前组织可见的 Canva 配置，用户无需选择或填写任何字段，点击连接即可跳转 Canva 可画网页完成 OAuth 授权。

DCR 直接登录和全球 Canva Connect REST OAuth 不再作为新建认证方式显示。运行时仅保留对已保存旧凭据的兼容处理。

插件不接受任意 MCP URL，不把 token、临时下载地址或 workspace 主机路径返回给 Agent。导出文件通过 Xpert Workspace Files runtime capability 写入当前用户工作区。

详细的架构、工具契约、配置和故障处理见 [`docs/index.mdx`](./docs/index.mdx)。

开发命令：

```bash
corepack pnpm exec nx run @xpert-ai/plugin-canva-connector:typecheck
corepack pnpm exec nx run @xpert-ai/plugin-canva-connector:test
corepack pnpm exec nx run @xpert-ai/plugin-canva-connector:build
```
