# 开发计划：OntoAgent 核心能力插件化（生成 / 传递 / 检索）

> 目标：以单个 Xpert Agentic App 插件交付 OntoAgent 的三项核心能力，**不 fork Auto-Ontology、不带 docker/外部服务**，评审者克隆本仓库即可构建、测试与演示。

## 1. 定位调整（必须先落）

原插件是「Auto 只读镜像消费端」，与目标相反。本次引入显式来源开关：

| `contextSource` | 语义 | 写边界 |
|---|---|---|
| `local`（默认） | 插件自有 append-only 本体为生产入口：导入 / 生成 → 闸门 → accepted | 可写；T2（`gov:` 顶层概念与 retract）默认挂起待人审 |
| `auto` | Auto-Ontology 认证快照为上游，插件只读镜像 | 只读；不注册生成/写工具，保留 `auto_snapshot_missing` 红线 |

两条来源共用同一套 `gate(G0/G1) → 分档 → accepted → 版本` 与同一份 `store`，因此 `local` 不是第二条写入通道，而是插件自身的候选产线；`auto` 仍是受治理上游。

## 2. 工作流

### A. 本体生成（local 产线）
- vendor `dsh-ontology-gate`（G2 降权 + T0/T1/T2 分档，218 行）
- vendor `dsh-ontology-plugin/service.ts`（slice / propose / commit / 版本 CAS / importPreset，458 行）
- vendor `dsh-ontology-plugin/pipeline.ts`（`ExtractPort` → Delta → 闸门 → 增量审计，352 行）
- 模型端口：OpenAI 兼容 chat（`models.baseUrl/chatModel/apiKey`），不引入新依赖
- 工具：`ontology_generate`（任务/语料 → Delta → 闸门 → 落盘）、`ontology_commit`（人工提交 Delta）、`ontology_import`（TTL/OWL 导入）
- 验收：`accepted>0` 且版本前进；重复生成 `duplicates>0` 不重复膨胀；`base_version` 过期返回 conflict 不落盘；T2 未批准时 `escalated` 可见且不写入

### B. 传递（多主体只读 Packet）
- 复用协议：`createTransfer` / `validateTransferEnvelope` / `receiveTransfer`（已在 vendor 的 core 中）
- 新增运输层：TypeORM 实体 `plugin_ontoagent_transfer`（tenant/org、transferId 唯一、packetHash、root/parent/depth、attempt/generation 围栏、receipt）
- 服务：`transferPacket`（切片 → 协议封装 → 去重 → 深度/循环校验）、`acceptTransfer`（围栏校验 → done，幂等重放）、`listTransfers`
- 工具：`ontology_transfer`、`ontology_transfer_inbox`
- **不做**：跨进程 A2A、`dsh-ledger` 3.7k 行、kill -9 等价承诺

### C. 检索召回
- local 路径走 `createPipeline().prepareForTask`：关系检索（dense → Jev → 词面）与三层注入门保持一致
- 补 `JudgePort`（OpenAI 兼容 `/rerank`，可选）+ `createCachedDensePort` 缓存
- 验收：可注入/不可注入两种结局都可见（`noSignal` / `degraded` / `reason`），预算截断有标记

### D. 种子与交付
- `src/seed/ontoagent-demo.ttl`：小型企业语义资产（客户/发票/收入/订单行 + join 与证据）
- `seed` 动作与首次启动幂等导入；Workbench 概览显示来源、版本、断言数
- 测试：生成、闸门拒绝、版本冲突、种子幂等、检索注入、传递去重/深度/围栏
- 文档：README 重写（定位、无 Auto 复现路径、验证状态、来源与许可）

## 3. 验收清单

| 项 | 通过条件 |
|---|---|
| 构建 | `corepack pnpm --filter @xpert-ai/plugin-ontoagent build` |
| 测试 | `... test` 全绿，含新增 8 项以上行为测试 |
| 生命周期 | `plugin-dev-harness` 通过 |
| 静态检查 | `check-plugin-metadata` / `check:entity-names` |
| 演示 | 无 Auto、无 docker：seed → 提问 → 注入 → 回答记录 → 确认；生成 → 版本前进；传递 → 收件箱可见 |

## 4. 非目标

- 不 fork Auto-Ontology、不提交 docker/部署件、不改 Xpert 宿主代码
- 不实现 Auto 侧语义编译、不做跨租户传递、不实现 clarify 选择卡 UI
- 不承诺传递的崩溃恢复与 DSH 语义等价

## 5. 执行结果（2026-11-11）

| 工作流 | 状态 | 证据 |
|---|---|---|
| 定位开关 `contextSource=local|auto` | ✅ | `ontoagent.config.ts`；auto 下生成/导入/提交/转交在服务层与工具层双重拒绝 |
| A 生成主链 | ✅ | vendor `dsh-ontology-gate`(218) + `ontology-service.ts`(458) + `ontology-pipeline.ts`(352)；工具 `ontology_generate/import/commit/seed` |
| B 传递 | ✅ | 协议复用 core（`createTransfer`/`forwardTransfer`/`validateTransferEnvelope`）+ 实体 `plugin_ontoagent_transfer`；去重/深度/回环/围栏/幂等领取均有测试 |
| C 检索召回 | ✅/⏳ | dense 缓存与三臂降级已接；新增可选 `/rerank` JudgePort；平台内真实模型 A/B 未跑 |
| D 种子与交付 | ✅ | `src/seed/ontoagent-demo.json`（24 条断言、6 条 join）；Workbench 概览/术语/转交三页签 + 一键导入 |
| 测试 | ✅ 13/13 | `tests/ontoagent.local.test.ts` 10 项 + 原 3 项 auto 红线 |
| 生命周期/静态检查 | ✅ | harness、`check-plugin-metadata`、`check:entity-names` |

未做（记录在案）：平台内安装与业务流程实测、真实 Auto 同步 smoke、真实模型 A/B、跨进程 A2A 与 kill -9 等价、clarify 选择卡 UI。
