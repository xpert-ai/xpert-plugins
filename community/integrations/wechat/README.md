# WeChat wx2.0 Plugin

微信 wx2.0 插件用于对接具备 webhook 推送与文本/图片发送接口的 wx2.0 HTTP 服务，将微信消息接入 Xpert Agent，并把 Agent 最终回复中的文本和图片通过 wx2.0 发送回会话。

## 功能概览

- 接收 wx2.0 webhook 推送的微信消息。
- 支持全局 webhook 入站格式：`webhook.allMessagePushUrl` / `AllMsgPushUrl`。
- 将消息规范化后派发给绑定的 Xpert Agent；可通过 trigger 配置进行防抖聚合、历史上下文注入和过滤。
- 发送 Agent 最终回复中的文本和图片到微信。
- 支持 Agent 主动发送到预配置微信联系人或群；定时任务通过 `xpert_task_*` runtime state 注入接收方参数，可实现每日早报、巡检提醒等定时消息。
- 支持 wx2.0 v2 文本/图片/媒体下载接口：`POST /v1/message/sendtext`、`POST /v1/message/sendimage`、`POST /v1/message/downloadfile`、`POST /v1/message/getmediafilechunk`。
- 可选回退旧发送接口：`POST /message/SendTextMessage?key=<uuid>`、`POST /message/SendImageMessage?key=<uuid>`。
- 提供 WeChat Workbench，用于查看账号、会话、消息日志、配置和运行日志。
- 提供 Agent middleware tools；管理员模式用于状态、回调、账号和队列运维，用户模式支持当前会话历史检索与受控主动发送。
- 使用 Redis-backed BullMQ 管理入站聚合任务和出站消息队列，支持跨实例 job 分发、延迟调度、账号/联系人串行锁、静默时段、暂停、取消和重试。
- 提供两个 Assistant Template：
  - `wechat-admin-assistant`：管理员模板，用于管理组织内所有微信集成。
  - `wechat-user-assistant`：使用者模板，用于接收微信消息并自动回复。

## 消息闭环

```text
微信用户
  -> wx2.0
  -> Xpert webhook /api/wechat/webhook/:integrationId
  -> 微信 trigger
  -> Redis BullMQ inbound aggregate queue (可选，summaryWindowSeconds > 0)
  -> Xpert Agent
  -> Agent final markdown content
  -> Redis BullMQ outbound queue
  -> wx2.0 /v1/message/sendtext 或 /v1/message/sendimage
  -> 微信用户
```

入站触发支持文本消息、wx2.0 明确标记为 `msgtype=3` 的微信图片消息、`msgtype=34` 的微信语音消息，以及文件 appmsg（`type=6` / `type=74`）。图片会通过 `/v1/message/downloadfile` 下载，校验为 JPEG/PNG/GIF/WebP 且不超过 10MB 后转为 `data:image/...;base64,...`，以 ChatKit 兼容附件形状（包含 `id`、`fileUrl`、`url`、`mimeType`、`mimetype`、`originalName`、`name`、`size`、`extension`）同步放入 Agent `message.input.files` 和 `state.human.files` 理解；图片没有附带文字时，立即派发的 user input 为空字符串。文件消息会先按 integration 级入站文件大小规则校验，默认超过 2 MiB 的文件不下载、不上传、不进入 Agent；通过规则的文件会下载为服务端临时 Buffer，随后写入 Xpert workspace 并触发 workspace-backed FileAsset 理解；传给 Agent 的 `files` 只包含 `fileAssetId/filePath/workspacePath` 等引用字段，不包含 `data:` URL、base64 或 buffer。语音不会作为 `audio/* files` 传给 Agent，而是通过 wx2.0 `/v1/message/downloadfile` 触发下载，再读取 `/v1/message/getmediafilechunk` 的 `variant: "voice"` wav 缓存，校验 RIFF/WAVE、最大 10MB、最长 60 秒，然后调用目标 Xpert 配置的 speech-to-text 模型转写为 human input。语音下载成功但转写失败或转写为空时，入站日志会标记为 `failed`，不会派发给 Agent。群聊图片、文件和语音都不会绕过 trigger 配置，仍然按 @、关键词、群过滤和 `groupTriggerMode` 决定是否触发。视频、表情、链接卡片等其他入站媒体仍未支持，也不把流式 token 实时推送到微信。

## 后台运行身份

微信插件使用平台统一的 Assistant 技术账号方案。wx2.0 webhook 进入 Xpert 时，`PluginWebhookAuthGuard` 会先把请求解析为当前 integration 的受限 `INTEGRATION` apiKey principal；这个身份只负责 webhook 鉴权、tenant/organization context 和通道审计，不作为 Agent executor。

消息真正派发到 Agent 时，插件会在 handoff payload 中写入：

```ts
runtimePrincipal: {
  type: 'assistant',
  xpertId,
  sourceIntegrationId: integrationId
}
```

宿主随后使用目标 Xpert 的 `xpert.userId` 作为后台执行技术账号。这个用户是 `UserType.COMMUNICATION`；如果目标 Xpert 还没有绑定技术账号，运行时会懒创建并回写。微信 sender、群成员、好友 wxid 只会进入 `fromEndUserId`、`channelUserId`、`senderId`、`contactId` 等上下文字段，不会作为平台用户执行 Agent。

插件会同时把 `integrationId`、`channelType`、`channelUserId` 和当前入站消息日志 id 写入 handoff options。宿主会把这些字段持久化到 root `xpert_agent_execution.metadata`，其中 `sourceIntegrationId` / `integrationId` 表示触发本次 Agent run 的微信集成，`sourceMessageLogIds` 可回查本插件的 `plugin_wechat_message_log` 入站记录。

因此在 Xpert 会话或日志里看到的“创建人”通常是微信助手对应的技术账号用户名。这表示当前 Agent run 由目标 `xpert.userId` 创建，不是微信用户本人，也不是 integration 的创建人或通信账号。

## 回复格式

微信普通聊天没有企业微信机器人那种原生 `markdown` 消息类型。本插件把 Agent 最终回复视为 markdown 源内容，先拆分为文本段和图片段，再通过 wx2.0 `sendtext` / `sendimage` 发送。

为了避免把 `**加粗**`、`# 标题`、Markdown 表格等标记原样发给微信用户，插件会在出站前把常见 Markdown 降级为微信友好的纯文本：

- 标题、加粗、斜体、删除线等标记会被移除，保留文本内容。
- 链接会转换为 `文本: URL`。
- 代码块会去掉围栏，保留代码内容。
- 表格会转换为普通分隔文本。

图片会从 markdown 源内容中解析出来并作为图片文件发送，支持：

- Markdown 图片：`![说明](https://example.com/a.png)`，alt 文本可以为空，例如 `![](https://example.com/a.png)`。
- 指向图片资源的普通 Markdown 链接：`[截图](https://example.com/a.png)`。
- 裸露的 `http(s)` 图片 URL，包括独立一行的 URL，以及带常见图片扩展名或 `/image`、`/images` 路径特征的行内 URL。

代码块内的图片链接不会被解析为图片。图片发送前会由插件服务端下载 URL，只允许 `http` / `https`，要求响应 `Content-Type` 为 `image/*` 或 URL 带常见图片扩展名，最大 10MB；下载成功后转为 base64，作为 wx2.0 `sendimage` 的 `imagecontent` 发送。下载或校验失败时不会自动把图片 URL 当作文本发给微信，而是记录失败并按出站队列策略重试。

同一条 Agent final content 如果包含图片，会先把所有非图片文本清洗并合并为一条文本消息，再按图片在 markdown 中出现的顺序发送图片，全部图片发送成功后追加一条 `N个图片已发完` 的文本收尾。开启出站队列时，每条文本或图片都会拥有独立的 outbound log 和 queue job。Assistant prompt 仍建议生成简洁自然的微信文本；需要文件、语音、链接卡片等其他富媒体体验时，应基于 wx2.0 的对应消息类型另行扩展。

## 前置条件

1. wx2.0 服务已启动。
2. Xpert 后端配置了可被 wx2.0 访问的 `API_BASE_URL`。
3. Xpert 后端连接了共享 Redis，用于 BullMQ 入站聚合和出站队列。生产环境 Redis 必须开启 AOF/RDB 或使用托管持久化 Redis，不能当纯缓存使用。
4. 插件已安装并启用。
5. 已创建或准备创建一个使用 `wechat-admin-assistant` 或 `wechat-user-assistant` 模板的 Agent。
6. 如果需要处理微信语音消息，目标 Xpert 必须配置 `features.speechToText.copilotModel`。模板不会内置或硬编码 speech-to-text 模型密钥。使用通义/Paraformer 等远程 speech-to-text 服务时，Xpert 生成的音频文件 URL 还必须能被模型服务从公网访问；本地 `localhost`、`127.0.0.1`、内网 IP 或只对 wx2.0 可见的地址会导致转写任务报 `url error`。

出站回复有两种连接方式：

- `direct_http`：Xpert 后端可以直接访问 wx2.0 HTTP 地址。
- `reverse_tunnel`：wx2.0 在内网，Xpert 无法直接访问它；推荐在 wx2.0 所在机器运行 sidecar。wx2.0 连接本机 sidecar 的 raw TCP 端口，sidecar 再通过 WSS 连接 Xpert 插件，由插件通过这条长连接转发本地 HTTP API 调用。

`API_BASE_URL` 很重要。它决定 wx2.0 收到消息后回调到哪里。

```sh
API_BASE_URL=https://your-xpert-api.example.com
```

如果启用微信语音输入并使用远程 speech-to-text 模型，`API_BASE_URL` 还会影响临时音频文件的下载地址，例如 `https://your-xpert-api.example.com/public/files/speech-to-text/...wav`。请确保该地址在公网环境下可以 `curl` 到 HTTP 200；本地开发可使用 ngrok、cloudflared 等隧道并把 `API_BASE_URL` 设置为隧道 HTTPS 地址，生产环境建议使用 OSS/云存储提供公网或签名 HTTPS URL。

本机调试时可以是：

```sh
API_BASE_URL=http://127.0.0.1:3000
```

如果 wx2.0 在 Docker 或另一台机器里，不能随便使用 `localhost`，因为 `localhost` 会指向 wx2.0 所在环境本身。

BullMQ 队列默认读取 Xpert 运行环境中的 Redis 连接配置：

```sh
REDIS_URL=redis://127.0.0.1:6379
```

也可以使用拆分配置：

```sh
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_TLS=false
```

## 创建微信集成

在 Xpert 集成配置页选择提供商：

```text
微信 wx2.0
```

字段建议如下。

| 字段 | 是否必填 | 建议值 | 说明 |
| --- | --- | --- | --- |
| 连接方式 | 否 | `direct_http` 或 `reverse_tunnel` | Xpert 到 wx2.0 的出站调用方式。 |
| wx2.0 服务地址 | direct_http 必填 | `http://127.0.0.1:8058` | Xpert 后端主动调用 wx2.0 发消息的地址。生产环境请填写 Xpert 后端可访问的 wx2.0 地址。 |
| 隧道客户端 ID | 自动生成 | 无需手填 | reverse_tunnel 模式使用系统集成 ID 作为 `MsgClientId`，Workbench 的“配置”页会展示完整 JSON。 |
| API 版本前缀 | 否 | `/v1/` | 用于拼出 `{baseUrl}/{apiVersion}message/sendtext`、`sendimage`、`downloadfile` 和 `getmediafilechunk`。 |
| 请求超时（毫秒） | 否 | `10000` | Xpert 调 wx2.0 的 HTTP 超时时间。 |
| API Token | 否 | 留空 | 仅当 wx2.0 启用 token 校验时填写。插件会作为 `token` header 发送。 |
| 首选语言 | 否 | `zh-Hans` | 用于默认提示和部分系统回复。 |
| Webhook 凭据 | 自动生成 | 无需手填 | 保存集成后由 Xpert host 为该 integration 生成 opaque webhook secret。配置中只保存 hash 和元数据，回调 URL 使用 `?secret=...`。wx2.0 当前不支持自定义 header，因此 webhook 鉴权只使用 query secret。 |
| 入站文件最大大小 | 否 | `2` MiB | 普通文件消息超过该值时会跳过文件，不下载、不上传 workspace、不传给 Agent；同一聚合窗口内的文本仍可继续触发。允许范围 `1` 到 `25` MiB。 |
| 失败时回退旧发送接口 | 否 | 开启 | `/v1/message/sendtext` 失败时尝试旧文本接口。 |
| 图片失败时回退旧发送接口 | 否 | 开启 | `/v1/message/sendimage` 失败时尝试旧图片接口。 |
| 出站队列 | 否 | 开启 | 使用 Redis BullMQ 排队发送文本和图片回复，支持延迟、限流、锁、取消、重试和暂停。 |
| 首次发送延迟 | 否 | `0` | 新消息入队后首次尝试发送前的延迟毫秒数。 |
| 全局最小间隔 | 否 | `0` | 任意两条出站消息成功发送之间的最小毫秒间隔。 |
| 同账号最小间隔 | 否 | `500` | 同一 `integrationId + uuid` 连续发送之间的最小毫秒间隔。 |
| 同联系人最小间隔 | 否 | `1000` | 同一 `integrationId + uuid + contactId` 连续发送之间的最小毫秒间隔。 |
| 同账号分钟/小时/天上限 | 否 | `60` / `1000` / `5000` | 超过后 job 会自动延后，不会 busy wait。 |
| 同联系人小时上限 | 否 | `120` | 单联系人小时级发送上限。 |
| 最大待发送积压 | 否 | 账号 `100` / 联系人 `20` | 积压超过限制时拒绝继续入队或暂停账号，避免无限堆积。 |
| 最大重试次数 | 否 | `4` | 交给 BullMQ attempts/backoff 处理。 |
| 重试退避（高级 JSON） | 否 | `[60000,300000,900000]` | BullMQ 固定退避毫秒数；当前发送 job 使用数组第一个值作为 fixed backoff。 |
| 溢出处理（高级 JSON） | 否 | `pause_until_manual_resume` | 积压超限时默认暂停该账号出站；也可设为 `reject` 只拒绝本次入队。 |
| 失败保护（高级 JSON） | 否 | `threshold: 5` / `windowSeconds: 900` | 同账号在窗口内连续最终失败达到阈值后暂停账号出站。 |
| 静默时段（高级 JSON） | 否 | `[]` | 可配置多个 `{start,end,timezone}`，命中时发送 job 会延后到静默结束。 |

direct_http 最小可用配置：

```text
连接方式: direct_http
wx2.0 服务地址: http://127.0.0.1:8058
API 版本前缀: /v1/
请求超时: 10000
首选语言: zh-Hans
失败时回退旧发送接口: 开启
图片失败时回退旧发送接口: 开启
```

reverse_tunnel 最小可用配置：

```text
连接方式: reverse_tunnel
隧道客户端 ID: <高熵随机字符串>
API 版本前缀: /v1/
请求超时: 10000
首选语言: zh-Hans
失败时回退旧发送接口: 开启
图片失败时回退旧发送接口: 开启
```

## 出站消息队列

默认情况下，`sendTextByIntegrationId()` / `sendImageByIntegrationId()` 不再直接调用 wx2.0。文本会先格式化为微信友好的纯文本；图片会在 worker 发送前下载并转为 base64。每个出站片段都会先创建一条 outbound message log，状态为 `queued`，然后投递 BullMQ job 到 Redis 队列：

```text
logical queue name: plugin_wechat_outbound
BullMQ prefix: plugin_wechat
Redis namespace: plugin_wechat:plugin_wechat_outbound
job: plugin_wechat_send_text
```

`plugin_wechat_send_text` 是历史 job 名称；实际发送类型由 log 的 `payloadSummary.type` 区分为 `text` 或 `image`。

立即返回的数据包含：

```json
{
  "success": true,
  "queued": true,
  "queueJobId": "...",
  "outboundLogId": "...",
  "scheduledAt": "..."
}
```

真正的 wx2.0 `sendtext` / `sendimage` 调用只发生在 BullMQ processor 中。发送成功后，message log 会更新为 `sent`，写入 wx2.0 `messageId` 和 `sentAt`；失败会按 BullMQ attempts/backoff 重试，最终失败会更新为 `failed`，并按失败保护规则暂停账号。

多实例部署时，所有 Xpert 实例必须连接同一个 Redis。BullMQ 负责跨实例 job 分发，同一个 job 只会被一个 worker 处理。插件的 processor 并发固定为 `1`，并且在发送前还会加 Redis 分布式锁，保证全局、同账号和同联系人都不会被多个实例同时发送：

```text
plugin_wechat:lock:outbound
plugin_wechat:lock:account:{integrationId}:{uuid}
plugin_wechat:lock:contact:{integrationId}:{uuid}:{contactId}
```

限流计数、暂停状态、失败保护状态和下一次可发送时间也保存在 Redis 中，key 都以 `plugin_wechat:` 开头。Redis 重启或 flush 会丢失待发送 job 和这些运行状态，因此生产环境必须使用持久化 Redis。

出站队列的核心字段会出现在集成表单中；高级策略也可以通过 integration options JSON 配置：

```json
{
  "outboundQueue": {
    "retryBackoffMs": [60000, 300000, 900000],
    "overflowAction": "pause_until_manual_resume",
    "failureGuard": {
      "threshold": 5,
      "windowSeconds": 900,
      "action": "pause_until_manual_resume"
    },
    "quietHours": [
      {
        "start": "23:00",
        "end": "08:00",
        "timezone": "Asia/Shanghai"
      }
    ]
  }
}
```

`quietHours` 使用 24 小时制 `HH:mm`。如果 `start < end`，表示同一天的静默窗口；如果 `start > end`，表示跨午夜窗口。`timezone` 可选，未填写时使用 Xpert 后端进程所在时区；无法识别的时区会回退到进程本地时区。

测试或专用 worker 部署时，可以通过环境变量关闭队列 processor 自动启动：

```sh
WECHAT_OUTBOUND_QUEUE_AUTORUN=false
WECHAT_INBOUND_QUEUE_AUTORUN=false
```

关闭后，入站聚合和出站发送 job 仍会写入 Redis，但当前进程不会自动消费这些 job，需要另一个启用 processor 的 Xpert 实例处理。

### 账号出站暂停与恢复

账号出站暂停是插件的发送保护开关，只影响指定 wx2.0 账号 `uuid` 的自动出站发送；不会禁用入站 webhook、不会停止消息日志记录，也不会阻止 Agent 被触发。账号被暂停时，Agent 仍可能正常生成回复，但最终发送到微信前会被队列拦截，出站日志错误会显示：

```text
outbound_account_paused:manual
```

或其他暂停原因，例如 `outbound_account_paused:failure_guard`。其中 `manual` 表示由 Workbench 或管理员 middleware tool 手动暂停。暂停状态保存在 Redis：

```text
plugin_wechat:paused:account:{integrationId}:{uuid}
```

这个功能用于给自动回复提供紧急刹车和恢复窗口：

- 当管理员发现 Agent 正在异常循环回复、误触发或发送内容需要人工检查时，可以先暂停账号出站。
- 当出站队列积压超过阈值且配置了 `overflowAction: pause_until_manual_resume` 时，插件可以暂停账号，避免继续无限入队。
- 当连续发送失败达到 `failureGuard.threshold` 时，插件会暂停账号，避免 wx2.0 或微信侧异常期间持续重试。

可以在 Workbench 的队列页操作：

1. 打开 WeChat Workbench。
2. 进入“队列”页。
3. 找到该 `uuid` 的任意队列/出站记录。
4. 点击“暂停”或“恢复”。

恢复账号出站会清除账号级暂停标记，并把仍处于 `paused` 状态的队列消息重新投递。已经被记录为 `failed` 的 AI 回复不会自动重发；恢复后需要在消息页对对应失败回复执行“重发”，或在队列页重试具体队列项。

注意，“账号出站暂停/恢复”和账号页的“启停账号接入”不是同一个功能。启停账号接入控制该账号是否处理入站消息；出站暂停只控制是否允许向微信发送自动回复。

如果需要临时恢复旧行为，可以在集成配置中设置：

```json
{
  "outboundQueue": {
    "enabled": false
  }
}
```

不建议在生产环境关闭队列，因为这会绕过跨实例同步、限流和队列审计。

保存后，进入 WeChat Workbench 的账号或配置页面，复制 Xpert webhook URL。

格式类似：

```text
https://your-xpert-api.example.com/api/wechat/webhook/<integrationId>?secret=<webhook-secret>
```

`<webhook-secret>` 是 Xpert host 为当前 integration 生成的 opaque token，不等同于平台 API key。host 校验 token hash 后，会把请求映射为受限的 `INTEGRATION` apiKey principal；后续派发 Agent 时再通过 `runtimePrincipal.type = "assistant"` 切换到目标 Xpert 的技术账号执行。

生产环境建议为 Xpert host 配置稳定的 `XPERT_PLUGIN_WEBHOOK_SECRET`。它只用于派生可重新展示的 opaque webhook token；数据库中仍只保存 token hash 和 credential 元数据。如果该 secret 变更，需要在 Workbench 中轮换 webhook credential 并重新配置 wx2.0 回调 URL。

## 配置 wx2.0 回调

wx2.0 需要把收到的微信消息推送给 Xpert webhook。推荐优先使用全局 webhook。

在 wx2.0 配置中设置：

```text
webhook.allMessagePushUrl = <Xpert webhook URL>
```

或：

```text
AllMsgPushUrl = <Xpert webhook URL>
```

这种方式适合多个账号统一推送。插件会从 payload 中读取 `uuid`、`contactid`、`content`、`sendusername`、`ownerwxid`、`msgtype`、`isself` 等字段。

## 配置反向隧道

当 Xpert 部署在外网，而 wx2.0 部署在本地网络中且没有公网 HTTP 地址时，建议使用 `reverse_tunnel`。

插件级配置示例：

```json
{
  "tunnelWsPath": "/api/wechat/tunnel/ws",
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
wx2.0 -> 127.0.0.1:8088 sidecar -> Socket.IO WebSocket namespace /api/wechat/tunnel/ws/<integrationId> -> Xpert 插件
```

生产反向代理需要放行宿主已有的 Socket.IO/Engine.IO WebSocket upgrade 路径（通常是 `/socket.io/`）；`/api/wechat/tunnel/ws/<integrationId>` 是 Socket.IO namespace，不是普通 HTTP route。

这种模式不需要在 Xpert 服务器额外暴露公网 TCP `8088`。其中 `127.0.0.1:8088` 是 wx2.0 所在客户端机器上的 sidecar 本地监听端口，不是 Xpert 插件服务端端口。

系统集成中选择：

```text
连接方式: reverse_tunnel
```

保存集成后，在 Workbench 的“配置”页复制完整 JSON。该 JSON 同时包含 sidecar 连接地址、本地监听端口、`MsgClientId`、全局 webhook 和 wx2.0 内置页地址：

```json
{
  "XpertUrl": "wss://your-xpert-api.example.com/api/wechat/tunnel/ws/<integrationId>",
  "ListenHost": "127.0.0.1",
  "ListenPort": 8088,
  "MsgClientId": "<integrationId>",
  "MsgClientName": "wechat-local",
  "AllMsgPushUrl": "https://your-xpert-api.example.com/api/wechat/webhook/<integrationId>?secret=<webhook-secret>",
  "InAppPageUrl": "http://127.0.0.1:8201"
}
```

sidecar 最直接的启动命令如下。`--client-id` 使用 JSON 里的 `MsgClientId`，该命令默认在本机监听 `127.0.0.1:8088`：

```sh
node scripts/wechat-tunnel-sidecar.mjs \
  --api-url https://your-xpert-api.example.com \
  --client-id <integrationId>
```

排查连接问题时可加 `--verbose`，sidecar 会打印 Socket.IO 连接成功、连接关闭，以及隧道帧类型摘要：

```sh
node scripts/wechat-tunnel-sidecar.mjs \
  --api-url https://your-xpert-api.example.com \
  --client-id <integrationId> \
  --verbose
```

如需显式指定本地监听地址和端口：

```sh
node scripts/wechat-tunnel-sidecar.mjs \
  --api-url https://your-xpert-api.example.com \
  --client-id <integrationId> \
  --listen-host 127.0.0.1 \
  --listen-port 8088
```

也可以直接传完整地址。注意该地址由 sidecar 使用 `socket.io-client` 连接，不是给普通 WebSocket 客户端直接使用的裸 WebSocket API：

```sh
node scripts/wechat-tunnel-sidecar.mjs \
  --xpert-url "wss://your-xpert-api.example.com/api/wechat/tunnel/ws/<integrationId>"
```

然后在 wx2.0 配置中使用 Workbench 展示的完整 JSON：

```json
{
  "XpertUrl": "wss://your-xpert-api.example.com/api/wechat/tunnel/ws/<integrationId>",
  "ListenHost": "127.0.0.1",
  "ListenPort": 8088,
  "MsgClientId": "<integrationId>",
  "MsgClientName": "wechat-local",
  "AllMsgPushUrl": "https://your-xpert-api.example.com/api/wechat/webhook/<integrationId>?secret=<webhook-secret>",
  "InAppPageUrl": "http://127.0.0.1:8201"
}
```

保存并重启 wx2.0 与 sidecar 后，Workbench 的“配置”页会显示 tunnel broker 是否启用、Socket.IO 地址、sidecar 本地监听、目标 clientId、连接状态、最近心跳、bindings 数量和最近错误。

安全注意：

- tunnel client id 由系统集成 ID 自动生成；生产环境必须使用 HTTPS/WSS 入口，由现有 HTTPS 入口提供 TLS。
- 全局 webhook 使用 `AllMsgPushUrl` 中的 opaque secret 鉴权，不要在日志或公开文档中暴露完整 URL。
- 多副本 Xpert 部署时，v1 要求 sidecar WSS 连接和出站调用落在同一个 API 实例；需要多副本无状态转发时，应引入专用 broker 或 Redis pub/sub。

## 配置 Assistant

插件内置两个模板，按角色选择：

```text
wechat-admin-assistant
wechat-user-assistant
```

### 管理员模板

`wechat-admin-assistant` 面向管理员。它不包含微信消息 trigger，不会接收或回复微信用户消息。

它包含：

- 一个主 Agent：负责排查和管理微信运行状态。
- 一个 `WechatRuntimeMiddleware`：`toolMode` 为 `admin`，负责让前端发现 WeChat Workbench，并提供运行时管理工具。

管理员 Workbench 在没有绑定单一集成时，会展示当前组织内所有微信集成的运行数据，包括账号、会话、消息、日志和每个集成的 webhook URL。

### 使用者模板

`wechat-user-assistant` 面向最终微信会话回复。它包含：

- 一个主 Agent：负责生成自然微信回复。
- 一个微信消息 trigger：负责接收微信消息并派发给 Agent。
- 一个 `WechatRuntimeMiddleware`：`toolMode` 为 `user`，只暴露受控主动发送工具；普通微信回复仍由插件自动回发。

创建后需要确认两个节点都选择了同一个微信集成：

1. `微信消息触发器`
   - `integrationId`: 选择刚创建的微信集成。
   - `sessionTimeoutSeconds`: 默认 `3600`，用于入站聚合状态和兼容旧配置；历史上下文时间范围优先使用 `historyContextWindowSeconds`。
   - `summaryWindowSeconds`: 默认 `0`，表示收到消息立即派发；大于 `0` 时会把同一会话键内连续消息聚合后再派发一次。
   - `historyContextLimit`: 默认 `20`，表示每次新 Agent session 会附带最近 20 条历史消息作为背景；设为 `0` 可关闭。
   - `historyContextWindowSeconds`: 默认 `3600`，只合并最近 1 小时内的历史消息；设为 `0` 表示不按时间过滤。
   - `selfMessagePolicy`: 默认 `history_only`，当前账号自己发出的消息只写入对应微信会话历史，不触发 Agent；可设为 `ignore` 完全忽略，或 `dispatch` 兼容旧触发行为。
   - `ignoreSelfMessages`: 兼容旧配置；未设置 `selfMessagePolicy` 且该值为 `false` 时等价于 `selfMessagePolicy: dispatch`。
   - `chatFilterMode`: 默认 `all`。如只回复群消息，设置为 `group_only`。
   - `allowedGroupIds`: 可选，仅回复指定群，例如 `["12345@chatroom"]`。
   - `blockedGroupIds`: 可选，排除指定群。
   - `allowedContactIds` / `blockedContactIds`: 可选，按 `contactId` 过滤私聊联系人或群。
   - `allowedSenderIds` / `blockedSenderIds`: 可选，按群内发言人或私聊发送人过滤。
   - `allowedKeywords`: 可选，配置后只有包含任一关键词的消息才会继续处理；私聊和群聊都生效。
   - `groupTriggerMode`: 推荐 `mention_or_keywords`。
   - `groupKeywords`: 按需配置。
   - `mentionFallbackNames`: 可选，仅当 wx2.0 未提供可靠 `atuserlist` 时，用配置的群昵称匹配 `@名称`。
   - `groupJoinWelcomeEnabled`: 默认 `false`。开启后，识别到新成员入群系统消息时会独立触发 Agent 生成欢迎语，不受普通群 @ 或关键词规则影响。
   - `groupJoinWelcomePrompt`: 入群欢迎提示词模板，支持 `{names}`、`{groupName}`、`{roomId}`、`{rawText}`。

2. `WeChat Runtime Tools`
   - `toolMode`: 使用者模板固定为 `user`，只暴露受控主动发送工具。
   - `integrationId`: 选择同一个微信集成。

发布或启用 Assistant 后，插件会把该集成绑定到当前 Agent。

入站消息派发采用 fresh session 模式：每个立即消息或聚合后的消息批次都会开启新的 Agent session，不会沿用旧 `conversationId`。插件会按规范化后的 `integrationId + uuid + contactId + senderId` 查询同一会话键下的历史入站消息、当前账号自己发出的 `history_only` 消息和已发送 Agent 回复，并把它们作为“历史上下文”拼入本次 user input。历史还会受 `historyContextLimit`、`historyContextWindowSeconds` 和 `/new` 写入的 `context_reset` 边界限制。

当 `summaryWindowSeconds > 0` 时，入站消息会投递到 Redis BullMQ 队列做防抖聚合：

```text
logical queue name: plugin_wechat_inbound
BullMQ prefix: plugin_wechat
Redis namespace: plugin_wechat:plugin_wechat_inbound
aggregate job: plugin_wechat_inbound_aggregate
flush job: plugin_wechat_inbound_flush
lock: plugin_wechat:lock:inbound:{integrationId}:{uuid}:{contactId}:{senderId}
state: plugin_wechat:trigger:aggregate:{integrationId}:{uuid}:{contactId}:{senderId}
```

入站 worker 允许不同会话键并行处理；同一个会话键的聚合状态更新由 Redis 分布式锁串行保护。这样可以避免把所有群和所有人都阻塞在一个全局 worker 上，同时仍保证同一会话键的消息按一个批次稳定合并。`summaryWindowSeconds <= 0` 时不经过入站聚合队列，直接开启 fresh session dispatch。

如果一个防抖窗口内的入站消息聚合后仍然没有任何文本，但包含图片或文件附件，派发给 Agent 的本次 user input 会使用默认文本 `[理解附件]`，附件仍通过 `files` 传递。语音消息会先转写成文本再进入聚合；语音无转写或转写为空会失败并停止派发，不使用 `[理解语音]` 兜底。

## 延迟链路与优化

一条微信消息从 wx2.0 入站到微信端收到 AI 回复，可能经过下面这些等待点。常见的五类延迟判断是正确的：`summaryWindowSeconds`、大模型思考时间、大模型回答时间、出站队列初始延迟、消息间隔都会影响体感速度；实际排查时还要把入站预处理、Agent 调度、工具调用、出站素材处理和 wx2.0 网络调用算进去。

完整链路按顺序可以拆成：

| 阶段 | 主要状态或现象 | 影响因素 | 优化方向 |
| --- | --- | --- | --- |
| wx2.0 webhook 到达 Xpert | Workbench 出现入站消息 | wx2.0 推送、网络、反向隧道或 direct HTTP 连通性、webhook 鉴权 | 保持 wx2.0 到 Xpert 网络稳定；反向隧道模式确认 sidecar 在线。 |
| 入站解析与过滤 | 入站消息可能被跳过、仅作历史或进入待派发 | 自己消息策略、群/联系人/关键词过滤、文件大小规则、去重、历史上下文查询 | 过滤规则越明确越好；低延迟场景减少不必要的历史上下文条数。 |
| 入站媒体预处理 | 语音、图片、文件消息在派发前可能停留更久 | 语音下载和 STT；图片下载；文件下载、上传 Xpert workspace、`understandFile`；文件大小超限会跳过 | 低延迟对话尽量使用纯文本；文件类消息会天然更慢。 |
| 消息聚合/防抖 | 入站状态从 `queued` / “已入队” 到 `dispatched` / “已分发” | Trigger 的 `summaryWindowSeconds`。大于 `0` 时会等同一会话键内连续消息聚合，flush job 延迟约为 `summaryWindowSeconds * 1000` 毫秒 | 需要秒回时设为 `0`；需要合并连续短消息时设为 `1` 到 `3`。 |
| Agent 派发与运行调度 | 入站已分发，但还没有 AI 回复 | fresh session 创建、handoff/callback 调度、目标 Agent 加载、平台运行队列 | 确认目标 Agent 已发布/启用，平台 worker 正常。 |
| 大模型思考时间 | Agent 已开始运行，但没有可发送文本 | 模型首 token 延迟、system prompt 长度、历史上下文长度、知识库/工具准备 | 选择更快模型，减少历史上下文和复杂 prompt。 |
| 工具调用与中间步骤 | Agent 运行中但最终回复迟迟不出 | Agent 调用工具、检索、文件理解、外部 API；多轮 tool call 会拉长总时间 | 减少非必要工具；优化工具超时和外部 API。 |
| 大模型回答时间 | 模型在生成长回复 | 回复长度、模型吞吐、是否流式；默认微信侧按 final text 发送，只有开启 `agentCallbackIntermediateTextEnabled` 才会尝试发送可见中间文本 | 提示词要求简短回复；需要更早看到部分内容时开启中间文本回调。 |
| 出站内容拆分与素材准备 | 已有 AI 内容，但还未进入或完成发送 | markdown 清洗；图片 URL 下载并转 base64；workspace 文件读取和校验；一个回复包含多张图片/多个片段会生成多条 outbound log | 低延迟优先纯文本；图片和文件会增加下载、编码和多条发送时间。 |
| 出站队列初始延迟 | 出站 log 为 `queued` / “已入队” | Integration `outboundQueue.initialDelayMs` | 低延迟默认设为 `0`。 |
| 出站限速、锁和静默时段 | 出站 log 为 `deferred`、`paused` 或长时间 `queued` | `globalMinIntervalMs`、`perAccountMinIntervalMs`、`perContactMinIntervalMs`、分钟/小时/日上限、账号/联系人锁、`quietHours`、账号暂停 | 低延迟场景降低间隔和上限限制；检查账号是否暂停、是否命中静默时段。 |
| wx2.0 发送与微信侧送达 | 出站 log 从 `sending` 到 `sent` / “已发送” | wx2.0 API 响应时间、请求超时、反向隧道转发、微信侧风控或网络波动 | 确认 wx2.0 服务健康；必要时提高稳定性而不是继续降低间隔。 |
| 失败重试 | 出站 log 反复 `failed` / `deferred` | `maxAttempts`、`retryBackoffMs`、失败保护暂停 | 查看 log error；修复 wx2.0、网络、素材下载或权限问题。 |

因此，排查延迟时先看消息卡在哪个状态：

- 入站停在 `queued` / “已入队”：优先看 `summaryWindowSeconds`、入站聚合 worker、Redis 和同会话是否不断有新消息刷新窗口。
- 入站已经 `dispatched` / “已分发”，但没有出站消息：优先看 Agent 运行、模型、工具调用、callback/handoff 错误。
- 出站停在 `queued`：优先看 `initialDelayMs`、队列 worker、Redis job 是否被消费。
- 出站变成 `deferred`：优先看消息间隔、分钟/小时/日上限、静默时段和 Redis 中的下一次可发送时间。
- 出站停在 `sending` 或最终 `failed`：优先看 wx2.0 API、网络、图片/文件素材下载、文件读取和请求超时。

低延迟回复的推荐配置：

```yaml
微信消息触发器:
  summaryWindowSeconds: 0
  historyContextLimit: 5 到 10
  historyContextWindowSeconds: 600 到 1800

微信 integration 出站队列:
  enabled: true
  initialDelayMs: 0
  globalMinIntervalMs: 0
  perAccountMinIntervalMs: 500
  perContactMinIntervalMs: 1000
  perAccountMaxPerMinute: 60
  perAccountMaxPerHour: 1000
  perAccountMaxPerDay: 5000
  perContactMaxPerHour: 120
  quietHours: []
```

如果仍然觉得慢，下一步通常不是继续降低出站间隔，而是看 Agent 侧：模型是否太慢、回复是否太长、是否频繁调用工具、是否附带了过多历史上下文，或者当前消息是否包含语音、图片、文件这类需要额外处理的媒体。

## 定时任务与主动发送

推荐把定时规则放在 Xpert 平台的定时任务机制里：定时任务负责按计划触发 Agent，并把本次任务配置好的 middleware runtime state 传给 Agent；Agent 负责生成内容，然后调用 WeChat Runtime Tools 暴露的主动发送工具；middleware tool 再从 state 中读取微信发送参数并提交到出站队列。这样定时、审计、重试、模型运行和微信发送边界清晰，插件也不会自己内建一套独立 scheduler。

定时任务 UI 在选择数字专家后，通过平台通用能力接口读取连接到 Agent 的 middleware `stateSchema`，并把其中以 `xpert_task_` 开头的属性渲染为任务的 runtime state 表单。用户在任务里填写的值会保存到 `runtimeState`，触发 Agent 时原样放进 chat request 的 `state`。

配置要求：

- `toolMode` 必须为 `user`，这样普通用户助手只暴露受控主动发送工具。
- `integrationId` 选择同一个微信集成。
- 微信接收方参数配置在定时任务的 runtime state 中，不配置在 middleware 节点 options 中。

定时任务表单字段说明：

| UI 字段 | state 字段 | 是否必填 | 作用 |
| --- | --- | --- | --- |
| wx2.0 账号 UUID | `xpert_task_uuid` | 是 | wx2.0 中当前微信账号的 key/uuid。插件发送消息时会把它作为 `sendtext` / `sendimage` 的 `uuid`，旧接口回退时作为 `?key=<uuid>`。 |
| 联系人或群 ID | `xpert_task_contact_id` | 是 | 真实微信接收方 ID 列表。私聊通常是好友 `wxid` 或 wx2.0 返回的联系人 ID；群聊通常形如 `12345@chatroom`。兼容历史单字符串值。 |
| 会话类型 | `xpert_task_chat_type` | 否 | 标识接收方是 `private` 还是 `group`。未填写时插件会逐个根据 contactId 是否以 `@chatroom` 结尾推断；发送仍以每个 contactId 为准。 |
| 默认 @ 用户 | `xpert_task_at_users` | 否 | 群聊文本消息默认 @ 的群成员 wxid 列表，会与 tool 入参中的 `atUsers` 合并去重后传给 wx2.0 的 `atusers` / `AtWxIDList`。多个接收方会复用同一组默认 @ 用户；这里只填 wxid，不填昵称；图片消息本身不携带 @。 |

任务中保存的 runtime state 形如：

```json
{
  "xpert_task_uuid": "SDmCf1k6wcW2",
  "xpert_task_contact_id": ["12345@chatroom", "wxid_friend"],
  "xpert_task_at_users": ["wxid_member_1"]
}
```

触发 Agent 时，平台会把任务的 `runtimeState` 合并进 chat request 的 `state`，并额外注入通用调度幂等键 `__idempotency_key`：

```json
{
  "message": {
    "input": {
      "input": "生成今日早报并发送到微信。"
    }
  },
    "state": {
      "xpert_task_uuid": "SDmCf1k6wcW2",
      "xpert_task_contact_id": ["12345@chatroom", "wxid_friend"],
      "xpert_task_at_users": ["wxid_member_1"],
      "__idempotency_key": "xpert-task:<taskId>:2026-06-17T08:00"
  }
}
```

Agent 生成 markdown 内容后只需要调用：

```json
{
  "content": "今日早报\n\n1. ...\n\n![](https://example.com/chart.png)"
}
```

`uuid`、`contactIds`、`chatType`、默认 `atUsers` 和 `idempotencyKey` 会由 middleware 从运行时 state 注入到隐藏 tool 参数中。Agent tool 不需要也不应该临时传任意 `uuid`、`contactId` 或群 ID。配置多个 contactId 时，middleware 会为每个接收方分别提交一条出站发送；如果平台注入了 `__idempotency_key`，会按 `uuid + contactId` 派生每个接收方独立的幂等键，避免重复任务只发送到第一个接收方。

`content` 与普通 Agent final reply 一样按 markdown 处理：文本会清洗成微信友好纯文本，图片 URL 会下载后转为 base64 图片文件，再走 wx2.0 `sendimage`；如果包含图片，会先发合并后的文本，再发图片，最后追加图片发送完成提示。主动发送复用同一条出站队列、限速、失败重试和 outbound log；不会绕过队列。

平台会为定时任务生成稳定的 `__idempotency_key`，插件会在发送前检查同一 integration 下是否已有相同 key 的 outbound log；存在时会跳过重复发送并返回已有日志状态。没有传 `__idempotency_key` 的主动发送会被记录为普通 `agent_tool` 来源，传了 key 的定时发送会记录为 `scheduled_agent` 来源。

## 消息过滤规则

通用入站过滤规则只在微信 trigger 配置中设置。微信 integration 配置负责连接方式、wx2.0 调用参数、出站队列策略，以及普通文件消息的入站大小保护规则；文件大小保护在下载和 workspace 上传前执行，避免超限文件进入后续 Agent 处理。

过滤逻辑按下面顺序执行，任一步不满足都会跳过，不会派发给 Agent：

0. `sendusername`、`fromusername`、`senderId` 或 `contactid` 为 `weixin` 的系统来源消息会在 webhook 归一化阶段直接丢弃，不写入消息日志。
1. 如果 wx2.0 标记该消息为当前账号自己发出，先按 `selfMessagePolicy` 处理：`history_only` 写入同一规范化会话历史但不触发 Agent，`ignore` 跳过，`dispatch` 才继续尝试触发 Agent。
2. 按 `chatFilterMode` 判断私聊/群聊范围。
3. 按联系人/群/发送人 ID 的白名单和黑名单判断是否允许。
4. 仅文本类消息、微信图片消息、微信语音消息和微信文件消息继续处理。文本接受 `msgType` 为空、`0` 或 `1`；图片只接受 wx2.0 机器字段 `msgtype=3` / `msg_type=3`；语音只接受 wx2.0 机器字段 `msgtype=34` / `msg_type=34`；文件接受顶层文件消息或 appmsg `type=6` / `type=74`。插件不会从 `[图片]`、`[语音]`、展示文本、文件名或其他偶然字段推断非文件媒体类型。`msgtype=10000` 系统消息默认不作为普通消息触发；仅在 `groupJoinWelcomeEnabled` 开启且识别为入群事件时，转换为欢迎请求交给 Agent。
5. 普通文件消息先按 integration 的 `inboundFileRules.maxSizeMb` 校验，默认 `2` MiB。超过限制的文件会标记为跳过，不调用 wx2.0 下载，不上传 workspace，也不会进入 Agent；如果同一防抖窗口还有文本或其他有效附件，剩余内容仍继续走后续规则。
6. 文本消息内容为空，或内容形如 `[图片]`、`[语音]` 这种纯占位文本时跳过；图片和通过大小规则的文件消息允许无文字，并通过 `files` 传给 Agent；语音消息必须先成功转写成非空文本才会派发。
7. 私聊消息通过前面规则后直接触发；群聊消息还要继续匹配 `groupTriggerMode` 和 `groupKeywords`。`keywords` 和 `mention_or_keywords` 模式下，语音会在通过账号/联系人/群/发送人过滤后先转写，再用转写文本匹配关键词；`mentions` 模式只会在原始 `atuserlist` / @ 匹配后转写。
8. 如果配置了 `allowedKeywords`，消息文本或语音转写文本还必须命中任一关键词才会继续处理。该规则在拼接历史上下文之前执行；纯图片消息没有可匹配文本时不会通过该关键词过滤。

列表型字段在保存时会去掉空白项并去重。空列表表示不限制；白名单非空时必须命中白名单，黑名单命中时一定跳过。因此同一个 ID 同时出现在允许和排除列表时，排除列表生效。

| 字段 | 行为 |
| --- | --- |
| `selfMessagePolicy` | `history_only`、`ignore`、`dispatch`。默认 `history_only`，自己发出的消息只作为同一微信会话的历史背景。 |
| `ignoreSelfMessages` | 兼容旧字段。未设置 `selfMessagePolicy` 且值为 `false` 时映射为 `dispatch`。 |
| `historyContextWindowSeconds` | 历史上下文时间窗口。默认 `3600`，设为 `0` 表示只按条数限制。 |
| `chatFilterMode` | `all`、`private_only`、`group_only`。用于限制只处理全部、私聊或群聊。 |
| `allowedContactIds` | contactId 白名单。私聊时是好友 wxid；群聊时是群 roomId。非空时只处理这些会话。 |
| `blockedContactIds` | contactId 黑名单。命中后不回复。 |
| `allowedGroupIds` | 群 roomId 白名单，例如 `12345@chatroom`。只对群聊生效；如果同时配置了 `allowedContactIds`，群消息需要同时满足两个白名单。 |
| `blockedGroupIds` | 群 roomId 黑名单。只对群聊生效。 |
| `allowedSenderIds` | 发送人 ID 白名单。私聊通常是好友 wxid；群聊是群成员 wxid 或 wx2.0 payload 中可解析出的群内发送人 ID。 |
| `blockedSenderIds` | 发送人 ID 黑名单。命中后不回复。 |
| `allowedKeywords` | 需要处理的消息关键词白名单。空列表表示不限制；非空时私聊和群聊都必须命中任一关键词。 |
| `mentionFallbackNames` | @ 昵称兜底名称列表。只在 wx2.0 payload 没有可靠 `atuserlist` 时使用；空列表表示不使用昵称兜底。 |
| `groupJoinWelcomeEnabled` | 新成员入群欢迎开关。默认关闭；开启后独立于 `groupTriggerMode`，但仍受账号启用、`chatFilterMode`、联系人/群白名单和黑名单限制。 |
| `groupJoinWelcomePrompt` | 欢迎请求提示词模板，默认生成简短中文欢迎语。 |

常见配置：

```yaml
chatFilterMode: group_only
allowedGroupIds:
  - 12345@chatroom
  - 67890@chatroom
```

这表示只回复这两个群里的消息。群消息是否最终触发 Agent，还会继续受 `groupTriggerMode` 和 `groupKeywords` 控制。

只回复某些群成员：

```yaml
chatFilterMode: group_only
allowedGroupIds:
  - 12345@chatroom
allowedSenderIds:
  - wxid_member_a
  - wxid_member_b
```

只回复某个私聊好友：

```yaml
chatFilterMode: private_only
allowedContactIds:
  - wxid_friend
```

当 wx2.0 没有给出 `atuserlist`，但群消息正文里会出现 `@小白龙` 这类昵称时，可以显式配置昵称兜底：

```yaml
groupTriggerMode: mention_or_keywords
mentionFallbackNames:
  - 小白龙
```

这样只有 `@小白龙` 会作为被 @ 触发；未配置时不会把任意 `@xxx` 都当作当前账号被 @。

## 群聊触发方式

`groupTriggerMode` 支持：

| 值 | 行为 |
| --- | --- |
| `mention_or_keywords` | 被 @ 或命中关键词时触发，推荐默认值。会先判断 @，再判断关键词。 |
| `mentions` | 仅被 @ 时触发。 |
| `keywords` | 仅命中关键词时触发。 |
| `all` | 群聊所有支持的入站消息都会触发，包括文本、图片和语音。谨慎使用。 |
| `off` | 群聊不触发。 |

`allowedKeywords` 和 `groupKeywords` 的关键词匹配都是大小写不敏感的包含匹配，不要求完整词边界。例如关键词 `小助手` 会命中 `请小助手看一下`。`groupKeywords` 为空时，`keywords` 模式不会触发；默认的 `mention_or_keywords` 模式在没有关键词时相当于只响应 @。

@ 识别会优先使用 wx2.0 payload 中的 `atuserlist` 和当前账号 `ownerWxid`：只有 `atuserlist` 包含当前账号 `ownerWxid` 才认为被 @。如果正文或展示文本里直接出现 `@<ownerWxid>`，也会认为被 @。当 wx2.0 没有提供可靠 `atuserlist` 时，插件只会使用 `mentionFallbackNames` 中显式配置的名称做昵称兜底，例如配置 `小白龙` 后匹配 `@小白龙`；未配置时不会把任意 `@xxx` 当作当前账号被 @。

群聊因 @ 触发后，插件会尽量去掉开头的 `@xxx` 前缀，再把剩余正文发给 Agent。

## 会话策略

插件使用如下 conversation key：

```text
integrationId:uuid:contactId:senderId
```

含义：

- 私聊：固定按真实对端联系人生成 `contactId:senderId = peerContactId:peerContactId`；即使当前账号自己发给不同好友，也会分别落到不同 key。
- 群聊：按 `群 + 发言人` 拆分会话，避免多人共用同一个 Agent conversation。

用户发送：

```text
/new
```

可以清空当前微信触发上下文中的缓存状态。插件不再持久化会话映射，每条入站消息都会单独创建 Agent conversation。

## Workbench

WeChat Workbench 通常出现在集成详情页和 Agent workbench 中。

主要页面：

- 账号页：查看 wx2.0 账号、在线状态、最近回调、最近回复、错误；复制 webhook；启停账号接入。启停账号接入控制入站处理，不等同于出站暂停。
- 消息页：查看入站/出站消息、状态、错误和 payload 摘要，支持重发最后一次 AI 回复。
- 队列页：查看出站排队消息的 `queueJobId`、状态、计划发送时间、发送时间和错误，支持取消、重试、暂停账号出站和恢复账号出站。
- 配置页：查看 wx2.0 baseUrl、apiVersion、token、群聊触发策略、session timeout 等配置摘要。
- 日志页：查看 webhook、dispatch、Agent callback、wx2.0 sendtext/sendimage 调用相关记录。

## Agent middleware tools

`WechatRuntimeMiddleware` 通过 `toolMode` 隔离管理员工具和用户侧工具。未显式配置 `toolMode` 时按 `user` 最小权限处理。普通微信回复仍由插件 callback processor 自动发送回原会话，不需要调用 middleware tools。

管理员模板使用 `toolMode: admin`，暴露以下运维工具：

| Tool | 用途 |
| --- | --- |
| `wechat_get_runtime_status` | 查看回调地址、绑定 Agent、账号数、消息数、错误数等运行状态。 |
| `wechat_get_callback_config` | 获取 Xpert webhook URL。 |
| `wechat_rotate_webhook_credential` | 轮换当前 integration 的 webhook credential，并返回新的 callback URL；旧 URL 随即失效。 |
| `wechat_revoke_webhook_credential` | 吊销当前 integration 的 webhook credential；wx2.0 需重新配置轮换后的 URL 才能继续推送。 |
| `wechat_list_accounts` | 查询账号列表。 |
| `wechat_search_message_logs` | 查询入站、出站、失败、跳过等消息日志。 |
| `wechat_list_outbound_queue` | 查询出站队列消息，包含 `queued`、`deferred`、`sending`、`paused`、`failed`、`cancelled` 和 `sent`。 |
| `wechat_cancel_outbound_queue_item` | 取消一条尚未发送或可取消的出站队列消息。 |
| `wechat_retry_outbound_queue_item` | 重试一条失败、取消或暂停的出站消息。 |
| `wechat_pause_outbound_account` | 暂停指定 wx2.0 账号的出站发送，并把待发送消息标记为 `paused`。 |
| `wechat_resume_outbound_account` | 恢复指定 wx2.0 账号的出站发送，并重新投递暂停中的消息。 |
| `wechat_set_account_enabled` | 启用或停用指定账号的入站处理。 |

用户会话模板使用 `toolMode: user`，暴露以下受控工具：

| Tool | 用途 |
| --- | --- |
| `wechat_search_chat_history` | 检索当前微信私聊或群聊中已由插件接收并落库的历史消息；可按关键词、方向、时间、群成员过滤。默认读取当前会话的 `uuid/contactId`，显式查询其他会话时仍受绑定 integration 与 trigger allow/block 配置限制。 |
| `wechat_send_message` | 使用 runtime state 中的微信发送参数主动发送 markdown 内容。用于平台定时任务触发 Agent 后发送群公告、每日早报等。 |

普通微信回复不需要调用工具；当用户要求回忆、总结或查找之前的微信消息时可调用 `wechat_search_chat_history`。只有定时任务、群公告、运营提醒等主动发送场景才需要调用 `wechat_send_message`。定时任务触发时，平台会把任务 runtime state 传给 Agent；middleware wrapper 会用这些 state values 补齐隐藏的 `uuid`、`contactIds`、`chatType`、`atUsers` 和 `idempotencyKey`。

## 测试发送

配置完成后，可以用 Xpert helper API 测试 Xpert -> wx2.0 发送链路：

```sh
curl -X POST "https://your-xpert-api.example.com/api/wechat/<integrationId>/send-text" \
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

1. wx2.0 的全局 webhook 是否指向 Xpert webhook URL。
2. `API_BASE_URL` 是否是 wx2.0 能访问的地址。
3. wx2.0 回调 URL 是否使用 Workbench 生成的完整地址，并带有正确的 `?secret=...`。
4. Assistant 是否已启用或发布。
5. `wechat` trigger 是否选择了正确的 integrationId。
6. Workbench 消息日志中是否显示 `skipped` 或 `failed`。
7. 如果消息日志显示 `已分发` 但 Xpert logs 没有 run，检查 handoff 队列、dead-letter 记录和消息日志的 callback error。正常后台派发会在 handoff payload 中带有 `runtimePrincipal.type = "assistant"`、目标 `xpertId` 和 `sourceIntegrationId`，并使用目标 `xpert.userId` 执行；缺少或不匹配时通常会进入 handoff error/dead 路径。

### 私聊能触发，群聊不触发

检查：

1. `wechat` trigger 的 `groupTriggerMode` 是否为 `mention_or_keywords`、`mentions`、`keywords` 或 `all`。
2. 如果使用关键词触发，trigger 的 `groupKeywords` 是否配置了实际会出现的词。
3. 群消息是否满足当前 `groupTriggerMode`；图片消息仍需满足 `all`、@ 或关键词策略；语音消息在关键词模式下会用转写文本匹配关键词。

### Agent 回复了，但微信没有收到

检查：

1. `wx2.0 服务地址` 是否正确。
2. Xpert 后端是否能访问 wx2.0。
3. wx2.0 `/v1/message/sendtext` 是否可用；图片回复还需要 `/v1/message/sendimage` 可用，入站图片和文件理解还需要 `/v1/message/downloadfile` 可用。入站文件还需要 Xpert runtime 暴露 `platform.workspace.files.uploadBuffer` 与 `platform.workspace.files.understandFile`；入站语音还需要 wx2.0 支持 `/v1/message/downloadfile` 生成 `voice` wav 缓存，并支持 `/v1/message/getmediafilechunk` 读取该缓存；目标 Xpert 还必须配置 `features.speechToText.copilotModel`。
4. 是否需要配置 `API Token`。
5. Workbench 队列页是否显示 `queued`、`deferred`、`paused` 或 `failed`。
6. Redis 是否可用且所有 Xpert 实例连接同一个 Redis。
7. Workbench 出站日志里的错误信息。
8. `失败时回退旧发送接口` 和 `图片失败时回退旧发送接口` 是否按需要开启。

如果出站日志错误为 `outbound_account_paused:manual`，说明该 wx2.0 账号的出站发送被手动暂停。先到 Workbench 队列页点击该 `uuid` 的“恢复”，再到消息页重发失败的 AI 回复。如果错误为 `outbound_account_paused:failure_guard`，说明连续发送失败触发了保护；恢复前应先确认 wx2.0 服务、Token、网络和发送接口已经恢复正常。

### 一直重复触发或自问自答

在 `wechat` trigger 中开启：

```text
忽略自己发出的消息
```

并确认 wx2.0 payload 中 `isself` 字段能正确标识自发消息。

### 回调返回 401/400 或 Plugin webhook secret is invalid

说明 wx2.0 推送时没有提供正确的 webhook secret，或该 integration 的 webhook credential 已轮换/吊销。

到 WeChat Workbench 的账号或配置页面复制最新 Xpert webhook URL，并重新设置 wx2.0 回调：

```text
<Xpert webhook URL>?secret=<webhook-secret>
```

wx2.0 当前不支持自定义 header，本插件不兼容旧的 `x-wechat-callback-secret` header 方式。

## 本地开发

在 `community` workspace 下执行：

```sh
pnpm --filter @xpert-ai/plugin-community-wechat test
pnpm --filter @xpert-ai/plugin-community-wechat typecheck
pnpm --filter @xpert-ai/plugin-community-wechat build
```

插件主要入口：

- provider key：`wechat`
- channel type：`wechat`
- trigger key：`wechat`
- view key：`wechat_workbench`
- assistant template keys：`wechat-admin-assistant`, `wechat-user-assistant`
- middleware provider：`WechatRuntimeMiddleware`

## 安全建议

- 每个微信 integration 都有独立 webhook credential。URL 中的 `secret` 是 opaque token；配置中只保存 hash 和生成元数据，可通过重新生成/轮换 credential 使旧 URL 失效。
- 插件 webhook guard 校验 credential 后，会把请求解析为受限的 `INTEGRATION` apiKey principal；这个 principal 只负责入站鉴权和通道审计。
- Agent 后台执行统一使用目标 `xpert.userId` 对应的 Assistant 技术账号。不要把 integration 创建/更新用户、trigger binding 创建/更新用户、微信 sender 或 `integration.userId` 当成 Agent executor。
- 不要把 wx2.0 HTTP 服务直接暴露到公网，除非有额外鉴权和网络隔离。
- 如果 wx2.0 启用 TokenAuth，请填写 `API Token`。
- 不要在 Agent prompt 或用户可见消息里泄露 callback URL、webhook secret、token、integrationId 等内部配置。
