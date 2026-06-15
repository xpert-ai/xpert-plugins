# Personal WeChat wx2.0 Plugin

个人微信 wx2.0 插件用于对接具备 webhook 推送与文本发送接口的 wx2.0 HTTP 服务，将个人微信消息接入 Xpert Agent，并把 Agent 最终文本回复通过 wx2.0 发送回会话。

## 功能概览

- 接收 wx2.0 webhook 推送的个人微信消息。
- 兼容两种入站格式：
  - 全局 webhook：`webhook.allMessagePushUrl` / `AllMsgPushUrl`。
  - 单账号回调：`POST /message/SetCallback?key=<uuid>`。
- 将消息规范化后派发给绑定的 Xpert Agent。
- 仅发送 Agent 最终文本回复到微信。
- 支持 wx2.0 v2 发送接口：`POST /v1/message/sendtext`。
- 可选回退旧发送接口：`POST /message/SendTextMessage?key=<uuid>`。
- 提供 Personal WeChat Workbench，用于查看账号、会话、消息日志、配置和运行日志。
- 提供 Agent middleware tools，用于 assistant 运行时发现 workbench，并辅助查询状态、回调配置、账号和日志。
- 提供两个 Assistant Template：
  - `wechat-personal-admin-assistant`：管理员模板，用于管理组织内所有个人微信集成。
  - `wechat-personal-user-assistant`：使用者模板，用于接收微信消息并自动回复。

## 消息闭环

```text
微信用户
  -> wx2.0
  -> Xpert webhook /api/wechat-personal/webhook/:integrationId
  -> wechat_personal trigger
  -> Xpert Agent
  -> Agent final text
  -> wx2.0 /v1/message/sendtext
  -> 微信用户
```

首版只处理文本消息和文本回复，不发送图片、文件、语音，也不把流式 token 实时推送到微信。

## 回复格式

个人微信普通聊天没有企业微信机器人那种原生 `markdown` 消息类型。本插件仍声明普通文本能力，Agent 最终回复会通过 wx2.0 `sendtext` 发送。

为了避免把 `**加粗**`、`# 标题`、Markdown 表格等标记原样发给微信用户，插件会在出站前把常见 Markdown 降级为微信友好的纯文本：

- 标题、加粗、斜体、删除线等标记会被移除，保留文本内容。
- 链接会转换为 `文本: URL`。
- 代码块会去掉围栏，保留代码内容。
- 表格会转换为普通分隔文本。

因此，Assistant prompt 仍建议直接生成简洁自然的微信纯文本。需要图片、文件、链接卡片等富媒体体验时，应基于 wx2.0 的对应消息类型另行扩展，而不是把个人微信通道声明为 Markdown 通道。

## 前置条件

1. wx2.0 服务已启动。
2. Xpert 后端配置了可被 wx2.0 访问的 `API_BASE_URL`。
3. 插件已安装并启用。
4. 已创建或准备创建一个使用 `wechat-personal-admin-assistant` 或 `wechat-personal-user-assistant` 模板的 Agent。

出站回复有两种连接方式：

- `direct_http`：Xpert 后端可以直接访问 wx2.0 HTTP 地址。
- `reverse_tunnel`：wx2.0 在内网，Xpert 无法直接访问它；推荐在 wx2.0 所在机器运行 sidecar。wx2.0 连接本机 sidecar 的 raw TCP 端口，sidecar 再通过 WSS 连接 Xpert 插件，由插件通过这条长连接转发本地 HTTP API 调用。

`API_BASE_URL` 很重要。它决定 wx2.0 收到消息后回调到哪里。

```sh
API_BASE_URL=https://your-xpert-api.example.com
```

本机调试时可以是：

```sh
API_BASE_URL=http://127.0.0.1:3000
```

如果 wx2.0 在 Docker 或另一台机器里，不能随便使用 `localhost`，因为 `localhost` 会指向 wx2.0 所在环境本身。

## 创建个人微信集成

在 Xpert 集成配置页选择提供商：

```text
个人微信 wx2.0
```

字段建议如下。

| 字段 | 是否必填 | 建议值 | 说明 |
| --- | --- | --- | --- |
| 连接方式 | 否 | `direct_http` 或 `reverse_tunnel` | Xpert 到 wx2.0 的出站调用方式。 |
| wx2.0 服务地址 | direct_http 必填 | `http://127.0.0.1:8058` | Xpert 后端主动调用 wx2.0 发消息的地址。生产环境请填写 Xpert 后端可访问的 wx2.0 地址。 |
| 隧道客户端 ID | reverse_tunnel 必填 | 随机高熵字符串 | 需与 wx2.0 `MsgClientInfo.Id` 一致，用于识别主动连接到 Xpert 的本地实例。 |
| API 版本前缀 | 否 | `/v1/` | 用于拼出发送接口 `{baseUrl}/{apiVersion}message/sendtext`。 |
| 请求超时（毫秒） | 否 | `10000` | Xpert 调 wx2.0 的 HTTP 超时时间。 |
| API Token | 否 | 留空 | 仅当 wx2.0 启用 token 校验时填写。插件会作为 `token` header 发送。 |
| 首选语言 | 否 | `zh-Hans` | 用于默认提示和部分系统回复。 |
| 回调密钥 | 否 | 留空或随机字符串 | 用于保护 Xpert webhook。填写后回调 URL 会带 `?secret=...`，也支持 `x-wechat-callback-secret` header。 |
| 群聊触发方式 | 否 | `mention_or_keywords` | 控制群聊中哪些消息会交给 Agent。 |
| 群聊关键词 | 否 | 如 `小助手`、`客服` | 群聊触发方式包含关键词时使用。 |
| 忽略自己发出的消息 | 否 | 开启 | 避免自己或机器人发出的消息再次触发 Agent。 |
| 失败时回退旧发送接口 | 否 | 开启 | `/v1/message/sendtext` 失败时尝试旧接口。 |

direct_http 最小可用配置：

```text
连接方式: direct_http
wx2.0 服务地址: http://127.0.0.1:8058
API 版本前缀: /v1/
请求超时: 10000
首选语言: zh-Hans
群聊触发方式: mention_or_keywords
忽略自己发出的消息: 开启
失败时回退旧发送接口: 开启
```

reverse_tunnel 最小可用配置：

```text
连接方式: reverse_tunnel
隧道客户端 ID: <高熵随机字符串>
API 版本前缀: /v1/
请求超时: 10000
首选语言: zh-Hans
群聊触发方式: mention_or_keywords
忽略自己发出的消息: 开启
失败时回退旧发送接口: 开启
```

保存后，进入 Personal WeChat Workbench 的账号或配置页面，复制 Xpert webhook URL。

格式类似：

```text
https://your-xpert-api.example.com/api/wechat-personal/webhook/<integrationId>
```

如果配置了回调密钥，格式类似：

```text
https://your-xpert-api.example.com/api/wechat-personal/webhook/<integrationId>?secret=<callbackSecret>
```

## 配置 wx2.0 回调

wx2.0 需要把收到的微信消息推送给 Xpert webhook。推荐优先使用全局 webhook。

### 方式一：全局 webhook（推荐）

在 wx2.0 配置中设置：

```text
webhook.allMessagePushUrl = <Xpert webhook URL>
```

或：

```text
AllMsgPushUrl = <Xpert webhook URL>
```

这种方式适合多个账号统一推送。插件会从 payload 中读取 `uuid`、`contactid`、`content`、`sendusername`、`ownerwxid`、`msgtype`、`isself` 等字段。

### 方式二：单账号 SetCallback

如果希望按账号设置回调，可调用 wx2.0 的旧回调接口：

```sh
curl -X POST "http://127.0.0.1:8058/message/SetCallback?key=<uuid>" \
  -H "Content-Type: application/json" \
  -d '{"CallbackURL":"<Xpert webhook URL>","Enabled":true}'
```

其中：

- `<uuid>` 是 wx2.0 中该微信账号的 key/uuid。
- `<Xpert webhook URL>` 是保存集成后得到的 Xpert webhook URL。

Workbench 中也提供生成 SetCallback curl 和注册回调的操作。

## 配置反向隧道

当 Xpert 部署在外网，而 wx2.0 部署在个人网络中且没有公网 HTTP 地址时，建议使用 `reverse_tunnel`。

插件级配置示例：

```json
{
  "tunnelWsPath": "/api/wechat-personal/tunnel/ws",
  "tunnelHeartbeatIntervalMs": 30000,
  "tunnelClientTimeoutMs": 90000
}
```

插件服务端不再启动 raw TCP broker，也不需要在插件配置里设置 `tcpHost` / `tcpPort`。Xpert 插件通过 NestJS `@WebSocketGateway` 暴露 Socket.IO over WebSocket 通道接收 sidecar 连接，入口默认启用，不再需要配置 `enabled` 开关。`tunnelWsPath` 建议保持默认值，sidecar 会使用该地址作为 Socket.IO namespace。

推荐使用 sidecar 模式。这里的部署边界是：

- Xpert 插件运行在 Xpert 后端内，只需要通过已有 HTTPS/WSS 入口暴露 Socket.IO gateway。
- sidecar 运行在 wx2.0 所在客户端机器上，和 wx2.0 处在同一个本地网络环境。
- wx2.0 不直接连接公网长连接；它仍连接本机 raw TCP `127.0.0.1:8088`。
- sidecar 负责把 wx2.0 的 raw TCP 隧道帧转发到 Xpert 插件的 Socket.IO 长连接。

```text
wx2.0 -> 127.0.0.1:8088 sidecar -> Socket.IO WebSocket namespace /api/wechat-personal/tunnel/ws/<tunnelClientId> -> Xpert 插件
```

生产反向代理需要放行宿主已有的 Socket.IO/Engine.IO WebSocket upgrade 路径（通常是 `/socket.io/`）；`/api/wechat-personal/tunnel/ws/<tunnelClientId>` 是 Socket.IO namespace，不是普通 HTTP route。

这种模式不需要在 Xpert 服务器额外暴露公网 TCP `8088`。其中 `127.0.0.1:8088` 是 wx2.0 所在客户端机器上的 sidecar 本地监听端口，不是 Xpert 插件服务端端口。

系统集成中选择：

```text
连接方式: reverse_tunnel
隧道客户端 ID: <与 wx2.0 MsgClientInfo.Id 一致>
```

sidecar 最直接的启动命令如下。该命令默认在本机监听 `127.0.0.1:8088`：

```sh
node scripts/wechat-tunnel-sidecar.mjs \
  --api-url https://your-xpert-api.example.com \
  --client-id <系统集成里的 tunnelClientId>
```

排查连接问题时可加 `--verbose`，sidecar 会打印 Socket.IO 连接成功、连接关闭，以及隧道帧类型摘要：

```sh
node scripts/wechat-tunnel-sidecar.mjs \
  --api-url https://your-xpert-api.example.com \
  --client-id <系统集成里的 tunnelClientId> \
  --verbose
```

如需显式指定本地监听地址和端口：

```sh
node scripts/wechat-tunnel-sidecar.mjs \
  --api-url https://your-xpert-api.example.com \
  --client-id <系统集成里的 tunnelClientId> \
  --listen-host 127.0.0.1 \
  --listen-port 8088
```

也可以直接传完整地址。注意该地址由 sidecar 使用 `socket.io-client` 连接，不是给普通 WebSocket 客户端直接使用的裸 WebSocket API：

```sh
node scripts/wechat-tunnel-sidecar.mjs \
  --xpert-url "wss://your-xpert-api.example.com/api/wechat-personal/tunnel/ws/<系统集成里的 tunnelClientId>"
```

然后在 wx2.0 配置中设置为连接本机 sidecar：

```json
{
  "ForwardServerInfo": {
    "Url": "127.0.0.1",
    "TcpPort": 8088,
    "HttpPort": 8099
  },
  "MsgClientInfo": {
    "Id": "<系统集成里的 tunnelClientId>",
    "Name": "wechat-local"
  }
}
```

保存并重启 wx2.0 与 sidecar 后，Workbench 的“配置”页会显示 tunnel broker 是否启用、Socket.IO 地址、sidecar 本地监听、目标 clientId、连接状态、最近心跳、bindings 数量和最近错误。

安全注意：

- tunnel 协议本身没有 TLS 和鉴权，生产环境必须使用高熵 `tunnelClientId`。
- sidecar 模式建议使用 HTTPS/WSS 入口，由现有 HTTPS 入口提供 TLS。
- 多副本 Xpert 部署时，v1 要求 sidecar WSS 连接和出站调用落在同一个 API 实例；需要多副本无状态转发时，应引入专用 broker 或 Redis pub/sub。

## 配置 Assistant

插件内置两个模板，按角色选择：

```text
wechat-personal-admin-assistant
wechat-personal-user-assistant
```

### 管理员模板

`wechat-personal-admin-assistant` 面向管理员。它不包含 `wechat_personal` trigger，不会接收或回复微信用户消息。

它包含：

- 一个主 Agent：负责排查和管理个人微信运行状态。
- 一个 `WechatPersonalRuntimeMiddleware`：负责让前端发现 Personal WeChat Workbench，并提供运行时管理工具。

管理员 Workbench 在没有绑定单一集成时，会展示当前组织内所有 `wechat_personal` 集成的运行数据，包括账号、会话、消息、日志、每个集成的 webhook URL 和 SetCallback curl。

### 使用者模板

`wechat-personal-user-assistant` 面向最终微信会话回复。它包含：

- 一个主 Agent：负责生成自然微信回复。
- 一个 `wechat_personal` trigger：负责接收个人微信消息并派发给 Agent。
- 一个 `WechatPersonalRuntimeMiddleware`：负责让前端发现 Personal WeChat Workbench，并提供运行时管理工具。

创建后需要确认两个节点都选择了同一个个人微信集成：

1. `个人微信消息触发器`
   - `integrationId`: 选择刚创建的个人微信集成。
   - `sessionTimeoutSeconds`: 默认 `3600`。
   - `summaryWindowSeconds`: 默认 `0`，表示收到消息立即派发。
   - `chatFilterMode`: 默认 `all`。如只回复群消息，设置为 `group_only`。
   - `allowedGroupIds`: 可选，仅回复指定群，例如 `["12345@chatroom"]`。
   - `blockedGroupIds`: 可选，排除指定群。
   - `allowedContactIds` / `blockedContactIds`: 可选，按 `contactId` 过滤私聊联系人或群。
   - `allowedSenderIds` / `blockedSenderIds`: 可选，按群内发言人或私聊发送人过滤。
   - `groupTriggerMode`: 推荐 `mention_or_keywords`。
   - `groupKeywords`: 按需配置。

2. `Personal WeChat Runtime Tools`
   - `integrationId`: 选择同一个个人微信集成。

发布或启用 Assistant 后，插件会把该集成绑定到当前 Agent。

## 消息过滤规则

插件支持在系统集成配置和 `wechat_personal` trigger 配置中设置过滤规则。两层规则会同时生效，实际可触发范围取交集：

| 字段 | 行为 |
| --- | --- |
| `chatFilterMode` | `all`、`private_only`、`group_only`。用于限制只处理全部、私聊或群聊。 |
| `allowedContactIds` | contactId 白名单。私聊时是好友 wxid；群聊时是群 roomId。非空时只处理这些会话。 |
| `blockedContactIds` | contactId 黑名单。命中后不回复。 |
| `allowedGroupIds` | 群 roomId 白名单，例如 `12345@chatroom`。只对群聊生效。 |
| `blockedGroupIds` | 群 roomId 黑名单。只对群聊生效。 |
| `allowedSenderIds` | 发送人 wxid 白名单。群聊中用于限制某些群成员。 |
| `blockedSenderIds` | 发送人 wxid 黑名单。 |

常见配置：

```yaml
chatFilterMode: group_only
allowedGroupIds:
  - 12345@chatroom
  - 67890@chatroom
```

这表示只回复这两个群里的消息。群消息是否最终触发 Agent，还会继续受 `groupTriggerMode` 和 `groupKeywords` 控制。

## 群聊触发方式

`groupTriggerMode` 支持：

| 值 | 行为 |
| --- | --- |
| `mention_or_keywords` | 被 @ 或命中关键词时触发，推荐默认值。 |
| `mentions` | 仅被 @ 时触发。 |
| `keywords` | 仅命中关键词时触发。 |
| `all` | 群聊所有文本消息都触发。谨慎使用。 |
| `off` | 群聊不触发。 |

群聊触发后，插件会尽量去掉明显的 `@xxx` 前缀，再把正文发给 Agent。

## 会话策略

插件使用如下 conversation key：

```text
integrationId:uuid:contactId:senderId
```

含义：

- 私聊：通常 `senderId` 与 `contactId` 一致。
- 群聊：按 `群 + 发言人` 拆分会话，避免多人共用同一个 Agent conversation。

用户发送：

```text
/new
```

可以重置当前微信会话。也可以在 Workbench 或 middleware tool 中重置指定 conversation binding。

## Workbench

Personal WeChat Workbench 通常出现在集成详情页和 Agent workbench 中。

主要页面：

- 账号页：查看 wx2.0 账号、在线状态、最近回调、最近回复、错误；复制 webhook；生成 SetCallback curl；启停账号接入。
- 会话页：查看私聊/群聊会话、绑定的 Agent conversationId，支持重置会话。
- 消息页：查看入站/出站消息、状态、错误和 payload 摘要，支持重发最后一次 AI 回复。
- 配置页：查看 wx2.0 baseUrl、apiVersion、token、群聊触发策略、session timeout 等配置摘要。
- 日志页：查看 webhook、dispatch、Agent callback、wx2.0 sendtext 调用相关记录。

## Agent middleware tools

`WechatPersonalRuntimeMiddleware` 暴露以下 Agent middleware tools。它们主要用于运行时管理和诊断，不用于普通微信回复。

| Tool | 用途 |
| --- | --- |
| `wechat_personal_get_runtime_status` | 查看回调地址、绑定 Agent、账号数、消息数、错误数等运行状态。 |
| `wechat_personal_get_callback_config` | 获取 Xpert webhook URL 和 SetCallback curl 模板。 |
| `wechat_personal_list_accounts` | 查询账号列表。 |
| `wechat_personal_list_conversations` | 查询会话绑定列表。 |
| `wechat_personal_search_message_logs` | 查询入站、出站、失败、跳过等消息日志。 |
| `wechat_personal_reset_conversation` | 重置指定会话。 |
| `wechat_personal_register_callback` | 为指定 wx2.0 账号调用 SetCallback。 |
| `wechat_personal_set_account_enabled` | 启用或停用指定账号的入站处理。 |

普通微信回复不需要调用这些 tools。Agent 产出的最终回答会由插件 callback processor 自动发送回微信。

## 测试发送

配置完成后，可以用 Xpert helper API 测试 Xpert -> wx2.0 发送链路：

```sh
curl -X POST "https://your-xpert-api.example.com/api/wechat-personal/<integrationId>/send-text" \
  -H "Content-Type: application/json" \
  -d '{
    "uuid": "<wx2-account-uuid>",
    "contactId": "wxid_xxx",
    "text": "这是一条来自 Xpert 的测试消息"
  }'
```

如果发送失败，先检查：

- `wx2.0 服务地址` 是否能从 Xpert 后端访问。
- `apiVersion` 是否为 `/v1/`。
- wx2.0 是否支持 `/v1/message/sendtext`。
- 是否需要填写 `API Token`。
- 是否开启了旧接口回退。

## 常见排障

### wx2.0 能收到微信消息，但 Xpert 没有反应

检查：

1. wx2.0 的全局 webhook 或 SetCallback 是否指向 Xpert webhook URL。
2. `API_BASE_URL` 是否是 wx2.0 能访问的地址。
3. 如果配置了 `callbackSecret`，wx2.0 回调 URL 是否带了正确的 `?secret=...`。
4. Assistant 是否已启用或发布。
5. `wechat_personal` trigger 是否选择了正确的 integrationId。
6. Workbench 消息日志中是否显示 `skipped` 或 `failed`。

### 私聊能触发，群聊不触发

检查：

1. `groupTriggerMode` 是否为 `mention_or_keywords`、`mentions`、`keywords` 或 `all`。
2. 如果使用关键词触发，`groupKeywords` 是否配置了实际会出现的词。
3. 群消息是否为空文本、图片、语音或其他暂不支持的媒体消息。

### Agent 回复了，但微信没有收到

检查：

1. `wx2.0 服务地址` 是否正确。
2. Xpert 后端是否能访问 wx2.0。
3. wx2.0 `/v1/message/sendtext` 是否可用。
4. 是否需要配置 `API Token`。
5. Workbench 出站日志里的错误信息。
6. `失败时回退旧发送接口` 是否开启。

### 一直重复触发或自问自答

开启：

```text
忽略自己发出的消息
```

并确认 wx2.0 payload 中 `isself` 字段能正确标识自发消息。

### 回调返回 400 或 Invalid callback secret

说明插件配置了 `回调密钥`，但 wx2.0 推送时没有提供正确密钥。

解决方式二选一：

```text
<Xpert webhook URL>?secret=<callbackSecret>
```

或请求 header：

```text
x-wechat-callback-secret: <callbackSecret>
```

## 本地开发

在 `community` workspace 下执行：

```sh
pnpm --filter @xpert-ai/plugin-community-wechat test
pnpm --filter @xpert-ai/plugin-community-wechat typecheck
pnpm --filter @xpert-ai/plugin-community-wechat build
```

插件主要入口：

- provider key：`wechat_personal`
- channel type：`wechat_personal`
- trigger key：`wechat_personal`
- view key：`wechat_personal_workbench`
- assistant template keys：`wechat-personal-admin-assistant`, `wechat-personal-user-assistant`
- middleware provider：`WechatPersonalRuntimeMiddleware`

## 安全建议

- 生产环境建议配置 `callbackSecret`。
- 不要把 wx2.0 HTTP 服务直接暴露到公网，除非有额外鉴权和网络隔离。
- 如果 wx2.0 启用 TokenAuth，请填写 `API Token`。
- 不要在 Agent prompt 或用户可见消息里泄露 callback URL、token、integrationId 等内部配置。
