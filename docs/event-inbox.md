# 为插件接入事件收件箱（Event Inbox）

业务事件可以先于会话或运行产生。插件保存来源事实，声明它的类型、展示方式和处理策略；平台负责持久收件、按对象调度、权限校验及展示。接入一个新来源后，Assistant 工作台和 Bosi 的两个个人入口都从同一份声明读取类型与分类。

## 声明类型与分类

在插件的 Nest 模块中注册实现 `PluginAgentEventSource` 的 provider，使用 SDK 的 `@AgentEventSourceStrategy(adapterKey)` 装饰它。令 `key` 与装饰器参数一致，声明 `readonly protocolVersion = 1`，在 `eventTypes` 中列出接受的版本。平台按组织加载策略，并核对绑定中的插件包名、适配器键和协议版本。以下是采购来源的完整类型声明，可直接作为其 `eventTypes` 属性的值。

```ts
import type { AgentEventTypeDefinition } from '@xpert-ai/plugin-sdk'

export const eventTypes = [
  {
    type: 'procurement.quote.revised',
    schemaVersion: 1,
    display: {
      label: { en_US: 'Quote revision', zh_Hans: '报价修订' },
      icon: { type: 'font', value: 'clipboard-list' },
      category: {
        key: 'procurement',
        label: { en_US: 'Procurement', zh_Hans: '采购事件' },
        icon: { type: 'font', value: 'package' }
      }
    }
  }
] as const satisfies readonly AgentEventTypeDefinition[]
```

- **类型**。在该插件和适配器内，`type + schemaVersion` 是机器识别的键。新事件使用未声明的组合时，收件服务返回 `unsupported_version`。事实结构或消费语义有不兼容变化时声明新版本；需要继续处理旧事实时保留旧声明及其处理逻辑。
- **名称与图标**。`display.label` 和 `display.icon` 用于列表与详情；`display.category` 还提供分类导航的稳定键、名称和图标。相同分类键的事件在可见范围内合并计数。多个类型要归入同一类，就复用同一份分类定义。名称使用 `I18nObject`，提供 `en_US` 和支持的译名；图标用 `IconDefinition`。类型、分类和授权都由显式数据决定，语言切换只影响呈现。
- **历史回执**。`display` 可省略。旧版缺少描述、对应版本已移除，或来源卸载时，已获准读取的回执使用原始类型键、通用图标和“未分类”。计数只包含范围内的实际回执。业务标题、消息正文和图标名称都不用于推断分类。

## 捕获、发布与消费

| SDK 方法 | 插件负责的行为 |
| --- | --- |
| `configure(context, enabled)` | 校验执行人对来源对象的权限，在来源事务中记录捕获归属及绑定修订。上下文中的租户、组织、工作区、可选项目、Assistant 和执行人由宿主绑定。 |
| `drain(context, publisher, limit)` | 从本插件的持久事实中按批取数，调用本次回调提供的 `publisher.publish(event)`。保存 `accepted` 或 `duplicate` 返回的 `receiptId`；按返回码处置拒绝。返回 `{ more }` 告知宿主是否还有事实。 |
| `handle(context, delivery)` | 按 `delivery.event` 重读不可变快照，重验来源对象和业务权限。利用 `receiptId`、分区代次 `fence` 和稳定业务操作键保证重入时返回相同决定；遵守 `context.signal`。 |

信封必填字段为 `sourceEventId`、`bindingRevision`、`type`、`schemaVersion`、`occurredAt`、`subject: { kind, key }` 和 `fact: { key, revision, sha256 }`。绑定及类型版本是正整数，事实修订是非空字符串；时间为带时区的 ISO 日期时间，摘要为 64 位小写十六进制 SHA-256。`subject` 标识要串行处理的业务对象，`fact` 指向插件保存的那个版本。业务载荷和凭据保留在来源存储中。

在同一绑定内重投时复用原信封，包括原发生时间、类型版本、事实键、修订和摘要。平台按 `bindingId + sourceEventId` 去重；同键同信封返回原回执，同键异文返回 `identity_conflict`。可选的 `PluginEventJournal` 支持以 PostgreSQL 事务保存路由、快照、发布回执和决定，表的声明与部署归插件负责。[采购来源事务与实体](../community/apps/procurement-quote-comparison/src/lib/event-journal.ts)

`handle` 的返回值有三种。业务操作已记录时返回 `{ status: 'handled', operationKey, resultRef: { kind, key } }`；按规则跳过时返回 `{ status: 'ignored', reasonCode }`；授权或业务前置条件阻止处理时返回 `{ status: 'blocked', reasonCode }`。短暂失败可以抛错交给平台退避。通知送达和模型运行完成仍由渠道与运行记录证明。

## 从已到期的事实唤醒 Agent

平台调度中间件通过 `create_scheduler({ mode: "follow_up", dueAt, purpose })` 创建通用期限，返回 `taskId`。Agent 可用 `list_scheduler({ mode: "follow_up" })` 查当前线程的待跟进项，用 `delete_scheduler({ mode: "follow_up", taskId })` 取消。采购延期风险通过 `procurement_follow_up` 维护同一条带业务版本的跟进记录，避免对同一风险重复设期。

到期处理器可从 `handle` 的第三个参数取得 SDK 的 `AgentEventFollowUp`。采购插件先提交当前风险版本的到期决定，再调用 `wake({ conversationId, threadId, agentKey, prompt })`。线程和 Agent 引用来自原始运行上下文。宿主验证目标并以回执 ID 防止重复受理。线程忙时插件保留等待状态；成功返回后才记为已启动。重试仍使用同一事实和回执。取消或登记答复会更新风险，已经提交的唤醒继续读取最新业务状态。Code Review 和飞书沿用两参数处理器。

## 为视图提供标题、结果与会话

实现可选的 `searchTitles(context, term)` 时，只返回当前绑定允许搜索的业务对象或结果引用。平台再与可见回执取交集。可选的 `describe(context, event, decision, options)` 返回 `title`、可展示的 `fields`、可选 `result` 和会话引用。对私有评审、采购案例等资源，先用当前执行人复查读取权限，再返回字段；权限不足可以返回 `null`。

当 `options?.includeConversation` 为真且有明确来源时，返回 `conversation: { conversationId }`。事实来自分支时一并返回原 `threadId`。平台检查该线程属于声明的会话，检查失败时隐藏跳转入口。来源记录没有关联时省略该字段。平台按绑定范围验证该会话及线程的可读性，决定是否向详情提供动作。点击时视图只把 `receiptId` 交给宿主的 `open_conversation` 命令，宿主重新查询回执后导航。插件只提供来源引用，导航由宿主处理。

## 三个来源如何使用同一契约

| 来源与分类 | 声明的事件类型（均为 v1） | 分区与业务结果 | 会话引用取自 |
| --- | --- | --- | --- |
| Code Review · `code_review.github` · `github` | `code_review.pull_request`（拉取请求）、`code_review.workflow_run`（工作流运行） | 绑定到仓库策略，以 GitHub delivery ID 去重，按 PR 编号或 workflow run ID 分区。复用评审运行 `review-run` 或工作流诊断 `workflow-diagnosis`。 | 该回执对应的可读评审记录或诊断记录。 |
| 采购比价 · `procurement.quote` · `procurement` | `procurement.quote.revised`（报价修订）、`procurement.follow_up.due`（跟进到期） | 以案例为分区，以报价系列和修订标识事实。首版为基线，交期延迟时创建一次 `procurement-risk`。同内容的第二份文档有独立解析记录，重解析保留最新业务修订。 | 该次解析写入不可变事实的会话 ID，按绑定、来源事件和摘要回读。 |
| 飞书 · `lark.inbound` · `lark` | `lark.message.received`（飞书入站消息）、`lark.card.action`（卡片操作） | Webhook 和 WebSocket 进入同一捕获流程。使用消息 ID 或卡片事件 ID 去重，按 `lark-chat` 分区；同一原卡的竞争操作重验实际点击者，已处理的回执引用 `lark-dispatch`。 | 已提交派发保存的会话，或同一 Handoff 运行的成功出站记录。派发结局未知时保留待核对状态。 |

新增类型可沿用以上模式。例如，为普通用户消息增加分类之前，先确定真实来源、声明类型版本与分类键，再由该来源发布事件。[Code Review 实现](../xpertai/apps/code-review/src/review-event-source.ts) · [采购实现](../community/apps/procurement-quote-comparison/src/lib/quote-events.ts) · [飞书实现](../xpertai/integrations/lark/src/lib/lark-event-source.ts)

## 验证接入

1. 使用所属工作区锁文件构建 SDK 消费者和插件，运行 dist-first 生命周期检查，确认实际产物能加载来源。三个现有插件使用 `3.36.0-event-inbox.1` 开发快照；部署主机需要提供兼容的 SDK、Contracts 和事件模块。[快照来源与复建](../packages/event-inbox-sdk-snapshot/README.md) · [生命周期检查](../plugin-dev-harness/README.md)
2. 在独立 PostgreSQL 验收库验证正常输入、同一事实重投、切回或多实例恢复、越权拒绝。核对回执 ID 和实际领域写入数。Code Review 可先启用仓库规则中的影子比对，核实旧路径与新路径的决定，再按仓库切流。[跨插件场景](../scripts/acceptance/event-inbox.test.ts)
3. 在工作台和两个个人入口选择同一回执，核对类型、分类、结果和会话。在另一个无权账户、无会话引用和历史描述缺失的情况下，分别验证数据权限、动作隐藏和“未分类”回退。
