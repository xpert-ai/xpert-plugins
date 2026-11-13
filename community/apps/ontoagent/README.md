# @xpert-ai/plugin-ontoagent

OntoAgent 受治理本体工作台：把本体**生产、分发与使用**收进一个 Agentic App 插件——导入或生成本体，经闸门签发成版本，按任务组装术语包在模型调用前注入，并把只读 Packet 转交给其他主体，最后在 Workbench 里审核带版本证据的回答。

```
导入 TTL/OWL ─┐
任务/语料 ────┴─▶ 生成 Delta ─▶ 闸门 G0/G1 + T0/T1/T2 ─▶ append-only 版本 ─┬─▶ 检索召回 + 术语包 ──beforeModel──▶ 回答（带版本证据）
                                                                          └─▶ 只读 Packet 转交（去重/深度/围栏）
Auto-Ontology（可选上游）──认证快照同步──▶ 只读镜像 ─────────────────────┘
```

**两种来源，一个内核**：`contextSource=local`（默认）以插件自有本体为生产入口；`contextSource=auto` 只消费 Auto-Ontology 认证快照，保持只读红线（`auto_snapshot_missing`，绝不本地生成兜底）。两者共用同一套闸门、版本与注入链路，`local` 因此不是第二条写入通道，而是插件自身的候选产线。

## 能力

- **本体生成（local）**：任务或语料 → 抽取 prompt（含 `base_version` 与已有本体摘要）→ Delta → 解析 → 闸门 → 落盘；返回 `stage/accepted/duplicates/rejected/reasons/baseVersionMismatch`，版本过期不静默改写。
- **权威导入**：TTL/OWL → 类/属性/标签/定义/子类关系，走 `gov:` 作用域与高权威序，不经模型转述。
- **闸门与分档**：G0 结构 + G1 形状（非 `sess` 必须带证据、Concept 必须有定义）+ G2 只降权；T2（顶层 `gov:` 与 retract）默认挂起待人审，`escalated` 显式可见。
- **检索召回**：词法精确层 → dense（OpenAI 兼容 embeddings，带按文本缓存）→ 阈值 → Jev/`JudgePort`（OpenAI 兼容 `/rerank`，可选）；三臂降级与 `arm/degraded/reason/cost` 全程可见。
- **上下文注入**：`beforeModel` 拼入受治理契约 + 术语包；`afterAgent` 落"待确认"回答记录（同对话同内容去重）。
- **只读工具**：`ontology_prepare` / `ontology_slice` / `ontology_query` / `ontology_search`。
- **写产线工具（仅 local）**：`ontology_generate` / `ontology_import` / `ontology_commit` / `ontology_seed` / `ontology_transfer` / `ontology_transfer_inbox`。
- **只读 Packet 转交**：复用 ADR-0012 协议（`createTransfer` / `forwardTransfer` / `validateTransferEnvelope`），运输层为 TypeORM 实体；同一 `transferId` 幂等、转交链深度受限、同内容回环拒绝、`attempt/generation` 围栏、领取幂等。接收方只能读 Packet，不能写本体。
- **Workbench**：总览（来源/本体版本/断言数/转交统计）、术语目录、回答审核（确认/拒绝 + 备注 + 版本证据）、Packet 转交列表、示例本体一键导入。
- **持久化**：本体为 append-only JSONL + Merkle 版本（按租户/组织分目录）；回答、同步运行、转交为 TypeORM 实体（`plugin_ontoagent_answer_record`、`plugin_ontoagent_sync_run`、`plugin_ontoagent_transfer`）。

## 快速开始（无需 Auto-Ontology、无需 docker）

```sh
cd community
corepack pnpm install
corepack pnpm --filter @xpert-ai/plugin-ontoagent build
corepack pnpm --filter @xpert-ai/plugin-ontoagent test
```

- `build`：tsc → 拷贝 Assistant YAML 与内置种子 → esbuild 打包自包含远程视图 `dist/remote/governed-workbench.html`。
- `test`：`tsconfig.spec` + `tsconfig.remote` 类型检查，`tsx --test tests/*.test.ts`（13 项业务行为测试）。

插件加载后：在 Workbench 点 **加载示例本体**（或让助手调用 `ontology_seed`）→ 提问（如"收入按什么日期确认？"）→ 观察注入与回答证据 → 审核确认。示例本体含客户/发票/订单行/产品/收入/应收账款与 6 条 join 关系。

生成需要对话模型：配置 `models.baseUrl` + `models.chatModel`（OpenAI 兼容）；未配置时 `ontology_generate` 显式返回 `chat_model_missing`，不落盘、不伪造 accepted。

## 配置

| 键 | 环境变量 | 说明 |
|---|---|---|
| `contextSource` | `ONTOAGENT_CONTEXT_SOURCE` | `local`（默认）/ `auto` |
| `storeDir` | `ONTOAGENT_STORE_DIR` | 本体根目录，默认 `<cwd>/data/ontoagent`，按租户/组织隔离 |
| `models.baseUrl` / `models.chatModel` / `models.apiKey` | `ONTOAGENT_MODEL_BASE_URL` / `ONTOAGENT_CHAT_MODEL` / `ONTOAGENT_MODEL_API_KEY` | 生成用对话模型（OpenAI 兼容） |
| `models.embedBaseUrl` / `models.embedModel` | `ONTOAGENT_EMBED_BASE_URL` / `ONTOAGENT_EMBED_MODEL` | 嵌入（如 `http://ollama:11434/v1` + `bge-m3`）；不配 = 纯词法 |
| `models.rerankBaseUrl` / `models.rerankModel` | `ONTOAGENT_RERANK_BASE_URL` / `ONTOAGENT_RERANK_MODEL` | 重排（`/rerank`）；不配 = dense/词法两臂 |
| `write.autoApproveTopScope` | `ONTOAGENT_AUTO_APPROVE_TOP_SCOPE` | 默认 `false`：顶层 `gov:` 变更挂起待人审 |
| `transfer.maxDepth` | `ONTOAGENT_TRANSFER_MAX_DEPTH` | 转交链深度上限，默认 3（协议全局上限 8 取小） |
| `gate.autoGateThreshold` / `gate.autoGateVersion` | `ONTOAGENT_GATE_THRESHOLD` / `ONTOAGENT_GATE_VERSION` | 注入门，默认 `0` / `auto-gate-v1` |
| `budget.maxTerms/maxAssertions/maxChars` | — | 术语包预算（可按中间件节点覆盖） |
| `autoOntology.apiUrl/apiToken/databaseIds/source` | `ONTOAGENT_AUTO_*` | 可选上游（`contextSource=auto` 时使用） |

## 安装到 Xpert

1. 构建后按宿主脚本安装（`POST /api/plugin` + 超管 bearer + `x-scope-level: tenant`，或 `plugin:deploy:local --plugin-dir community/apps/ontoagent --scope <tenant-or-organization>`）。
2. 从 **OntoAgent Governed Context Assistant** 模板创建助手，确认画布中间件节点与工具；打开 Workbench 导入示例本体。
3. `contextSource=local` 时按上面的模型配置接入对话/嵌入/重排；`auto` 时填 Auto API 地址与令牌。

## 验证状态

| 项 | 结果 |
|---|---|
| 构建 | ✅ `pnpm build` |
| 测试 | ✅ 13/13（种子幂等、注入、权威导入、闸门拒绝、版本冲突、T2 挂起、生成产线、无模型显式失败、转交去重/深度/围栏、auto 拒绝转交、原有 auto 只读三条红线） |
| 生命周期 | ✅ `plugin-dev-harness`（含新实体） |
| 静态检查 | ✅ `check-plugin-metadata.mjs --package community/apps/ontoagent`；`check:entity-names` |
| 平台内安装与业务流程 | ⏳ 未验证（本机 Xpert 实例未初始化） |
| 真实 Auto 在线同步 | ⏳ 未验证（当前环境术语全部未认证） |
| 真实模型 A/B 复测 | ⏳ 未执行 |

**已知限制**

- 转交是**同进程只读 Packet 传递**：不做跨进程 A2A，不承诺与 DSH 账本的 kill -9 恢复语义等价（无 `dsh-ledger` 的 delivery job/outbox）。
- 澄清选择卡 UI 未实现：`auto-clarify-v1` 仅在 prompt 层要求宿主选择，默认关闭。
- 生成质量取决于所配模型与语料；闸门只保证结构与证据，不保证语义正确。
- Auto 只读红线不变：`contextSource=auto` 时生成/导入/提交/转交工具不注册，服务层也会显式拒绝。

## 复用来源与许可

| 来源 | 许可 | 方式与改动 |
|---|---|---|
| 本人项目 OntoAgent（`@ontoagent/dsh-*`，未发 npm） | 自有代码，随本 PR 按仓库 AGPL-3.0 公开 | vendor 至 `src/lib/vendor/`：`dsh-ontology-core`（全量）、`dsh-ontology-store`、`dsh-ontology-gate`（全量）、`dsh-auto-ontology-adapter`、`ontology-service.ts`（原 `dsh-ontology-plugin/service.ts`）、`ontology-pipeline.ts`（原 `dsh-ontology-plugin/pipeline.ts`）、`auto-pipeline.ts`。跨包 import 改相对路径；`strictNullChecks:false` 下两处 discriminated union 显式字段检查（`relation-retrieve.ts`、`ontology-pipeline.ts`）。DSH 专属件（ledger/host-adapter/memory/legacy gate）不带入 |
| NVIDIA/auto-ontology | Apache-2.0 | 仅作为可选治理上游部署，不复制代码 |
| `community/apps/sales-ontology`、`community/apps/dockyard` | AGPL-3.0 | 参照插件模块/中间件/视图/模板结构与远程视图构建方式，未整段复制业务代码 |

## 基线

- xpert-ai/xpert main `ba8736c897474f7db9a261aa5f64d95860bb9f60`
- xpert-ai/xpert-plugins main `9bfa96594a3debbb33f0ba25c7ade49e7d360c8b`
- 设计说明：[`docs/PLAN.zh-CN.md`](docs/PLAN.zh-CN.md)
