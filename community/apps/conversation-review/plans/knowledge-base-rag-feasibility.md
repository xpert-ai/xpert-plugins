> **状态：已搁置，未执行。** 2026-09-18 完成可行性调研与实施方案设计，用户决定暂不投入（详见 TODO.md 功能构想 E）。本次会话没有对代码做任何改动——两轮 Explore 均为只读探查，本文件是存档的方案，不是进行中的任务。如果之后决定要做，直接从这里继续即可，不用重新调研。

# 知识库 RAG 检索补充（TODO.md 功能构想 E）

## Context

用户想要一个"亮点"能力：给 conversation-review 助手接入一个可选知识库，检索出的培训手册片段作为分析时的补充参考，明确要求"不复杂""知识库为空也不能报错"。此前两轮只读探查已确认：

- `@xpert-ai/plugin-sdk`（本机解析 3.18.x）已内置 `KnowledgebaseRuntimeCapability`（`list`/`search`/`writeChunk`/`deleteChunks`），取用方式与本插件已用的 `WorkspaceFilesRuntimeCapability` 完全对称：`context.runtime?.capabilities?.get(KnowledgebaseRuntimeCapability)`。
- Assistant DSL（`xpert-conversation-review-assistant.yaml`）的 Agent 节点已经有原生字段 `entity.knowledgebaseIds`（目前是空数组），对应 `IAgentMiddlewareContext.knowledgebaseIds`。这是平台任意 Agent 节点通用的"绑定知识库"字段，Xpert Studio 编辑该 Agent 节点时应已有现成的知识库选择 UI——因此**不需要插件自己造配置项/下拉框**，只需消费这个已有字段。
- 全仓库目前没有任何插件真正调用过 `KnowledgebaseRuntimeCapability`，这会是第一个落地案例，没有现成范例可抄，只能对照 `WorkspaceFilesApi` 的既有用法模式（`conversation-review.middleware.ts` 里读聊天附件字节那段）。
- 平台没有现成的"知识库下拉选择"后端接口（`remoteSelect` 那套在 Connector 上有范例，但 Knowledgebase controller 没有对应路由），所以走插件自定义 configSchema 选择框的路线成本更高——这也是选择"复用 Agent 级 `knowledgebaseIds` 字段"而不是"插件自己加配置项"的原因。

**未确认、纯推测的关键风险**：`context.knowledgebaseIds` 会不会在真实运行时被正确填充——只看到 YAML DSL 里有这个空字段和 SDK 类型声明里有这个 interface 字段，没有找到任何一个插件真正读过它，也没有真机验证过"在 Studio 给 Agent 节点绑定知识库"这个操作到底会不会把 id 传进这个字段。这条比已经真机验证过的 C/D 两项（聊天附件、微信截图）风险更高一档。

结论：不新增插件配置项，只新增一个独立的 Agent 工具做检索，绑定通过 Studio 里 Agent 节点自带的知识库选择完成。未绑定/能力不存在/检索失败/检索结果为空这四种情况全部返回 `success: true` 的降级消息，绝不抛错、绝不中断分析流程——满足"知识库为空不报错"的硬要求，即使"`knowledgebaseIds` 传不进来"这个假设错了，最坏结果也只是这个工具永远查不到东西，不影响其余分析流程。

## 设计取舍：新增独立工具，而非塞进 `check_rules`

`rule-check.ts` 的核心价值是"跨模型确定性"，`checkRulesTool` 的 `risks` 命中会被 `saveAnalysisTool` 无条件二次合并，语义上必须保持"纯规则"。RAG 检索是概率性的、可选的，不应该混进同一个工具/字段，否则会污染 `ConversationIssue.source: 'rule'` 的确定性语义（TODO.md 已明确指出这一点）。因此新增一个单独的、职责单一的工具 `conversation_review_search_knowledge`，走现有"一个工具一个职责"的既有模式（对照 `searchCustomerTool`/`getStatsTool`：无 recordId、不挂在单条记录流程上）。

## 具体改动

### 1. `src/lib/constants.ts`
新增：
```ts
export const CONVERSATION_REVIEW_SEARCH_KNOWLEDGE_TOOL_NAME = 'conversation_review_search_knowledge'
export const KNOWLEDGE_SEARCH_DEFAULT_LIMIT = 5
export const KNOWLEDGE_SEARCH_MAX_LIMIT = 10
export const KNOWLEDGE_REFERENCE_MAX_CHARS = 600 // 截断片段，避免把整篇手册塞进上下文
export const CONVERSATION_REVIEW_KNOWLEDGE_SEARCH_SOURCE = 'conversation-review'
```
带一段注释说明：这个工具不产出 `ConversationIssue`，不进入 `risks`/`source: 'rule'` 语义，只是给模型的参考文本。

### 2. `src/lib/conversation-review.middleware.ts`
- import 新增 `KnowledgebaseApi`、`KnowledgebaseRuntimeCapability`（来自 `@xpert-ai/plugin-sdk`）。
- 在 `createMiddleware` 里，仿照 `workspaceFiles` 那行，新增：
  ```ts
  const knowledgebase: KnowledgebaseApi | undefined = context.runtime?.capabilities?.get(KnowledgebaseRuntimeCapability)
  const knowledgebaseIds = (context.knowledgebaseIds ?? []).filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
  ```
- 新增 schema：
  ```ts
  const searchKnowledgeSchema = z.object({
    query: z.string().min(1).describe('要在公司培训手册/知识库里查询的具体问题或主题（如报价审批权限、交付承诺话术规范），不要整段粘贴对话原文。'),
    limit: z.number().int().min(1).max(KNOWLEDGE_SEARCH_MAX_LIMIT).optional().describe(`返回条数，默认 ${KNOWLEDGE_SEARCH_DEFAULT_LIMIT}。`)
  })
  ```
- 新增 `searchKnowledgeTool`，handler 四条降级路径全部返回 `success: true`（不是工具错误，只是"没有可用参考"）：
  1. `!knowledgebaseIds.length` → `references: []`，message 说明未绑定知识库，按对话内容和自身判断继续。
  2. `!knowledgebase`（能力不存在）→ 同上，message 说明当前环境不支持检索。
  3. 调用 `knowledgebase.search({ tenantId, organizationId, knowledgebaseIds, query, k: limit, source: CONVERSATION_REVIEW_KNOWLEDGE_SEARCH_SOURCE })`，`try/catch` 包裹；失败 → `references: []`，message 带错误原因但仍要求模型继续分析。
  4. 成功但 `documents.length === 0` → `references: []`，message 说明没检索到相关内容。
  5. 成功且有结果 → 截断每条 `pageContent` 到 `KNOWLEDGE_REFERENCE_MAX_CHARS`，映射出 `{ content, source }`（`source` 取 `metadata.title`/`metadata.fileName`，都没有则省略），message 明确标注"仅供参考、非确定性规则、不要当成 check_rules 的结果"。
  - 工具的 `description` 里写清楚：可选调用，用于给 concerns/scores/requirements 提供公司专属背景依据；结果不是确定性规则；未绑定或检索失败时会得到清楚的说明而不是报错。
- push 进 `createMiddleware` 返回对象的 `tools` 数组（第十个工具）。不加入 `CONTEXTUAL_TOOL_NAMES`（不涉及 recordId 自动注入）。

### 3. `src/xpert-conversation-review-assistant.yaml`
- Agent 节点 prompt 里，在现有"必经步骤 3（check_rules）"之后插入一个可选步骤 3a：说明可以调用 `conversation_review_search_knowledge` 查询公司专属背景（定价政策、交付话术规范、折扣审批权限等），结果仅作参考、不是规则命中，未绑定知识库或没查到时按原判断继续，不要因此中断分析。
- "Analysis rules" 里补一句：`concerns`/`requirements`/`risks` 如果参考了知识库检索结果，仍要基于对话本身的证据（`evidence` 必须是对话原文逐字引用），知识库内容只是背景，不能替代 `evidence`。
- `entity.knowledgebaseIds` 保持 `[]`（不写死具体 id，交给使用者在 Studio 里为这个 Agent 节点绑定知识库）。
- `hash: conversation-review-agent-v3` → `v4`（prompt 内容变化，沿用既有的版本号递增惯例）。

### 4. `tests/conversation-review.middleware.test.mjs`
新增一个 `describe('knowledge base search (conversation_review_search_knowledge)')` 块，本地定义一个支持多能力的 `fakeContextWithCapabilities({ knowledgebaseIds, knowledgebase })`（`get(key)` 按 key 分流，import 真实的 `KnowledgebaseRuntimeCapability` token 用于匹配），从 `middleware.tools` 里取出新工具后直接 `.invoke(args)`。覆盖：
1. 未绑定知识库（`knowledgebaseIds` 为空/未设置）→ `references: []`，不抛错。
2. 绑定了 id 但能力不存在（`knowledgebase` undefined）→ 同上。
3. 检索成功且有结果 → `references` 正确映射、截断生效、message 提示条数。
4. 检索成功但空结果 → `references: []`，message 说明没查到。
5. 检索抛错 → 被捕获，返回 `success: true` 的降级消息，不抛出异常。

### 5. `examples/sales-training-manual.sample.md`（新建）
一份示例培训手册 markdown，供用户直接导入到平台知识库测试检索效果，用 `##` 分节方便切块，内容示例性质、非真实公司政策（README 里会注明）：
- 报价与折扣审批权限
- 交付承诺话术规范（哪些话术算过度承诺）
- 常见客户异议与推荐应对话术
- 合规红线（不可对客户承诺的事项）

### 6. `README.md`
- 第 456 行注释"九个 Agent 工具" → "十个 Agent 工具"；第 469 行叙述段落追加一段说明第十个工具 `conversation_review_search_knowledge`：可选、需要在 Studio 给这个 Agent 绑定知识库才有效、未绑定/检索失败/无结果三种情况都返回清楚的降级说明而不是报错、检索结果只作为模型自己判断的背景参考、不进入确定性规则体系。
- 「已知限制」表新增一行："知识库检索未经真机验证"——核心路径（工具调用 → 能力存在性判断 → 检索/降级）有单测覆盖，但没有真实 Studio 环境验证"给 Agent 绑定知识库"这条 UI 路径是否确实把 id 传进 `context.knowledgebaseIds`，以及真实检索结果对模型判断的实际帮助程度；后续方向写清楚"用 `examples/sales-training-manual.sample.md` 导入一个真实知识库，绑定后跑一次真机验证"。
- 「二、运行说明」里补一小节或一条提示：如果想启用知识库检索，需要在 Studio 打开这个助手的 Agent 节点，绑定一个已导入 `examples/sales-training-manual.sample.md`（或任意培训手册）的知识库。

### 7. `TODO.md`
把 E 项从"待拍板"更新为"已实现,核心路径未经真机验证"，写清楚新增了什么工具、降级策略、示例文件路径，以及仍需要真机验证 Studio 绑定知识库这条路径。

## 验证

- `npm run build`（`tsc -p tsconfig.lib.json`）——重点验证 `@xpert-ai/plugin-sdk` 当前锁定的 peer 版本范围（`^3.10.1`，本机实际解析 3.18.x）确实导出 `KnowledgebaseRuntimeCapability`/`KnowledgebaseApi` 类型；如果类型缺失需要处理（提升 peerDependency 下限或改用运行时字符串 key）。
- `npm test`（`tsc --noEmit` + `node --test tests/**/*.test.mjs`）——新增的 5 个用例 + 现有全部用例应全部通过。
- 真机验证（需要真实 Studio + 已发布助手环境，不在本次自动化范围内，写进 README「尚未验证」）：在 Studio 给这个助手的 Agent 节点绑定一个知识库（导入 `examples/sales-training-manual.sample.md` 得到），走一次完整分析，确认模型会调用 `conversation_review_search_knowledge` 并在 concerns/requirements 里体现参考内容；再解绑知识库跑一次，确认不报错、正常完成分析。

## 建议的低成本验证方式（如果之后想先探路再决定要不要投入完整实现）

不用先写完整工具，可以先在 Studio 里给这个助手的 Agent 节点随便绑定一个已有知识库，然后在 `wrapModelCall` 里临时打印/断言一次 `context.knowledgebaseIds` 的值（或者塞一条调试用的 system message 把它显示出来），跑一轮真实对话看这个字段到底传不传得进来。确认传得进来之后再按上面第 1-6 步实现完整功能，可以省掉"完整实现完却发现字段是空的"这个最大的风险。
