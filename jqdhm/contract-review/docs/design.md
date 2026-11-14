# 合同资料整理助手设计

## 1. 目标与边界

用户是需要登记合同资料的运营或销售支持人员。输入合同纯文本后，系统先保存原文，再让模型整理候选字段；用户在同一工作台对照原文、修改、确认和生成摘要。

Java 服务负责业务规则、原文和结果持久化、作用域、幂等、并发控制及审计。Xpert TypeScript 插件负责宿主扩展、上下文和视图桥接。模型没有修改或确认权限。首版不含 PDF/OCR、电子签署、法律判断或多级审批。

## 2. 一次交互

1. 页面调用 `intake_contract`，由插件请求 Java `POST /api/contracts/intake`，保存标题、原文和六个空字段。
2. 返回 `DRAFT`、`version=1`、`extractionPending=true`，审计为 `RECEIVED`。页面此时已经拿到可恢复的记录 ID。
3. 页面向助手发送记录 ID。模型调用 `contract_review_get` 读取服务端原文，再通过 `contract_review_candidates` 提交字段和依据。
4. Java 校验依据确实来自已保存原文，以版本条件写入候选并记 `EXTRACTED`。正常首次提取后为 v2，`extractionPending=false`。
5. 人工修改后，页面发送 `expectedVersion` 保存修订，记 `UPDATED`；典型流程为 v3。
6. 人工确认时再次校验版本和关键字段，记 `CONFIRMED`；典型流程为 v4。摘要读取已保存结果，不另让模型重写。

v2/v3/v4 是“提取一次、人工保存一次、确认一次”的示例。每次有效修订都会递增版本，不能在客户端写死版本号。

## 3. 数据契约

```text
FieldValue = { value: string, evidence: string }
Fields = {
  partyA: FieldValue|null, partyB: FieldValue|null,
  amount: FieldValue|null, effectiveDate: FieldValue|null,
  expiryDate: FieldValue|null, paymentTerms: FieldValue|null
}
Contract = {
  id, title, sourceText, fields,
  status: DRAFT|CONFIRMED, version, extractionPending,
  warnings, createdAt, updatedAt,
  audit: [{ action, actorId, at }]
}
```

标题最多 120 字符；通用原文接口最多 50,000 字符，本地 Ollama 提取最多 6,000 字符。缺失信息用 `null`，不猜测。字段值和依据不能为空。JSON DTO 拒绝未知属性，`candidates` 不能额外夹带新原文。

| 请求 | 请求体 / 结果 |
|---|---|
| `POST /api/contracts/intake` | `{title, sourceText}`；创建或复用原文草稿 |
| `POST /api/contracts/{id}/candidates` | `{fields}`；返回保存后的记录，或已有更晚结果 |
| `GET /api/contracts` | `{items:[...]}`，最多最近 50 条 |
| `GET /api/contracts/{id}` | 返回完整记录，包括原文及审计 |
| `PUT /api/contracts/{id}` | `{expectedVersion, fields}`；只修改草稿 |
| `POST /api/contracts/{id}/confirm` | `{expectedVersion}`；确认或幂等返回既有确认 |
| `GET /api/contracts/{id}/summary` | `{status, summary}` |
| `POST /api/contracts/extract` | 本地 profile：`{requestKey, title, sourceText}` |
| `POST /api/contracts` | 兼容/fixture：`{requestKey, title, sourceText, fields}` |

`POST /api/contracts` 保留用于测试草稿与兼容，审计为 `CREATED`；当前 Agent 不暴露此入口。

## 4. 身份与权限

所有业务请求必须携带 Bearer 服务令牌及 `X-Tenant-Id`、`X-Organization-Id`、`X-User-Id`、`X-Assistant-Id`，共同构成访问范围。插件从宿主上下文解析身份，模型参数不包含这些身份字段。跨范围读取按不存在处理，避免暴露其他范围的数据。

服务令牌在 Java 与插件服务端配置。页面和模型看不到令牌。`/health` 公开，只返回健康状态。HTTP 错误返回 `{code,message}`，不返回 SQL、堆栈或令牌。

插件注册时注入 `() => context.config`，客户端在每次请求开始时解析当前配置。这样后台修改服务地址或令牌后，后续请求会采用新值，不会继续持有注册时的配置快照。配置边界仍由同一 schema 校验；适配层测试覆盖运行中的配置变更。

Agent 仅有 get、candidates、list、summary 四个工具；页面 action 才有 intake、update、confirm、summary。页面展示使用文本赋值或安全 DOM，合同正文不作为 HTML 执行。

## 5. 幂等、原子性和迟到结果

原文接收键是 `intake:` 加对 `{title,sourceText}` JSON 的 SHA-256。数据库唯一约束包含访问范围和请求键。相同范围内相同标题、原文复用同一记录；它是精确内容复用，不做相似合同识别。

本地 `/extract` 先建立 `contract_extraction_requests` 记录，把范围、调用方 `requestKey`、原文哈希和合同 ID 绑定。已有页面 intake 草稿时直接复用。创建/复用与请求键绑定在同一事务中；并发唯一键冲突后回滚重读，最多尝试 3 次。同键对应不同原文返回 `IDEMPOTENCY_CONFLICT`。绑定表外键在合同删除时级联清理；当前页面不提供合同删除功能。

模型推理在数据库事务外执行，避免长时间占有数据库连接。模型返回后另开短事务：读取服务端原文并校验证据，按原版本及 `DRAFT` 条件更新。只有仍处于待提取状态的记录可以首次写候选。

如果另一提取请求、人工修订或确认已先完成，迟到候选返回已保存的当前结果，不再覆盖。重复候选不递增版本、不重复记审计。人工修订和确认使用 `expectedVersion` 比较更新，旧版本返回 `VERSION_CONFLICT`。

确认重复请求只在记录已确认且当前版本恰好是调用方预期版本加一时认作重放；不能把任意旧请求当作确认成功。确认条件更新的并发失败也会重读并判断是否为同一次已完成确认。

## 6. 待提取、失败和恢复

`extractionPending` 是服务端计算属性：初始 `RECEIVED` 的 v1 草稿仍在等待候选。失败保留这份记录及原文，刷新通过列表和 ID 找回，再次尝试同一合同。

待提取草稿不能确认，返回 `EXTRACTION_PENDING`。人工也可以对照原文填写并保存，保存后不再处于待提取状态；确认仍需满足甲方、乙方、金额等关键字段要求。已确认记录不能继续修订。

字段依据不匹配返回 `EVIDENCE_MISMATCH`，不写入错误候选。模型超时、不可用、无效 JSON 或忙碌都会明确失败，本地演示不以 fixture 兜底。超时、中断和无效输出的错误文案明确说明原文已经保存、候选未提取成功，避免误导用户认为原文也丢失。重复提交已经完成的记录，页面复用结果，不再启动本地提取。

本地 Ollama 仅在 `local-extraction` profile 开启。默认 `qwen2.5:7b`、请求超时 180 秒、单并发；平台模式由 Xpert 的模型工具链完成提取。这两条推理入口共用 Java 原文、校验和确认规则，但不能把本地模式成功视作平台模式通过。

## 7. 持久化和验证边界

演示使用 H2 文件库，记录、版本和审计一起持久化。自动测试包含文件库重新启动后的读取。生产数据库适配、集群扩容、完整操作权限体系不在本次范围内。

验证分为 Java 接口/持久化、TypeScript 适配层、JSDOM 页面与 HTTP 桥接、本地真实浏览器和真实 Xpert 平台。2026-09-22 已在真实 Xpert 工作台完成原文保存、Agent get/candidates 调用、Ollama 提取、人工修改、确认和刷新读取。另受控注入一次保存 HTTP 503，验证保留修改、阻止确认及重试恢复。

平台验收使用测试管理员及“合同助手本地验证”组织。用户原账号也已成为该组织的有效成员，切换组织后可以打开助手；合同数据仍按用户等四维范围隔离。结果分别记录于 [validation.md](validation.md)，不以健康接口或插件加载成功替代完整业务验收。
