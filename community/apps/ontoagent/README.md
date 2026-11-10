# @xpert-ai/plugin-ontoagent

OntoAgent 受治理本体上下文工作台：把 Auto-Ontology 的认证语义资产同步为**带版本、可回放的只读镜像**，在每次模型调用前注入完整术语包，并在 Workbench 中完成证据审查与回答确认。

```
Auto-Ontology(编制/认证) ──原生YAML+Terms REST──▶ 同步/只读镜像 ──▶ 检索召回/术语包 ──beforeModel──▶ Assistant 回答
                                                              └──▶ Workbench：版本/排除/stale · 术语目录 · 回答确认（落库可恢复）
```

**Auto 模式只读**：插件不生成本体、不注册 propose/commit、不做答案回写；空镜像显式 `auto_snapshot_missing`，离线沿用旧镜像并标记 `stale`，绝不本地生成兜底。

## 能力

- **同步**：原生 YAML + Terms REST 认证回读；双读一致才发布；幂等 diff、删除墓碑、排除/不支持项报告；`offline`/`sync_unstable` 显式可见，支持手动重试。
- **检索召回**：默认词法（`auto-gate-v1`、threshold=0）；配置 OpenAI 兼容嵌入后启用 dense 分层检索；完整术语包 + 必要 join + 原子预算截断，无覆盖不注入。
- **中间件** `OntoAgentGovernedContextMiddleware`：`beforeModel` 注入只读契约 + Packet；`afterAgent` 落"待确认"回答记录（同对话同内容去重）。
- **只读工具**：`ontology_prepare` / `ontology_slice` / `ontology_query` / `ontology_search`。
- **Workbench**：总览（版本/stale/排除项/同步记录）、认证术语目录（搜索分页）、回答审核（确认/拒绝、审核备注、版本与检索证据）。
- **持久化**：镜像为 append-only 文件（按租户/组织分目录）；回答记录与同步运行记录为 TypeORM 实体（`plugin_ontoagent_answer_record`、`plugin_ontoagent_sync_run`）。

## 构建与测试

```sh
cd community
corepack pnpm install
corepack pnpm --filter @xpert-ai/plugin-ontoagent build
corepack pnpm --filter @xpert-ai/plugin-ontoagent test
```

- `build`：tsc → 拷贝 Assistant YAML → esbuild 打包自包含远程视图 `dist/remote/governed-workbench.html`。
- `test`：tsconfig.spec + tsconfig.remote 类型检查，`tsx --test tests/*.test.ts` 业务行为测试（空镜像红线、回答去重与审核幂等、同步失败可见）。
- 生命周期（在插件仓库根目录）：

```sh
corepack pnpm --pm-on-fail=ignore -C plugin-dev-harness install
corepack pnpm --pm-on-fail=ignore -C plugin-dev-harness build
node plugin-dev-harness/dist/index.js --workspace ./community --plugin @xpert-ai/plugin-ontoagent
```

当前结果：build ✅；test 3/3 ✅；harness 生命周期 ✅；`check-plugin-metadata.mjs --package community/apps/ontoagent` ✅；`check:entity-names` ✅。harness 使用模拟 TypeORM/权限，不代表真实数据库与平台业务流程已验收（见"验证状态"）。

## 配置

插件配置（或对应环境变量）：

| 键 | 环境变量 | 说明 |
|---|---|---|
| `autoOntology.apiUrl` | `ONTOAGENT_AUTO_API_URL` | Auto-Ontology 地址，如 `http://localhost:3000` |
| `autoOntology.apiToken` | `ONTOAGENT_AUTO_API_TOKEN` | Auto 用户菜单 → API Tokens 生成（凭证，勿提交） |
| `autoOntology.databaseIds` | `ONTOAGENT_AUTO_DATABASE_IDS` | 逗号分隔；空 = 默认库 |
| `autoOntology.source` | `ONTOAGENT_AUTO_SOURCE` | 来源标识，默认 `default` |
| `storeDir` | `ONTOAGENT_STORE_DIR` | 镜像根目录，默认 `<cwd>/data/ontoagent`，按租户/组织隔离 |
| `models.embedBaseUrl` / `models.embedModel` | `ONTOAGENT_EMBED_BASE_URL` / `ONTOAGENT_EMBED_MODEL` | OpenAI 兼容嵌入（如 `http://ollama:11434/v1` + `bge-m3`）；不配 = 纯词法 |
| `gate.autoGateThreshold` / `gate.autoGateVersion` | `ONTOAGENT_GATE_THRESHOLD` / `ONTOAGENT_GATE_VERSION` | 默认 `0` / `auto-gate-v1`；`auto-clarify-v1` 为实验配置，默认不启用 |
| `budget.maxTerms/maxAssertions/maxChars` | — | 术语包预算（可按中间件节点覆盖） |

## 安装到 Xpert

1. 准备 `community/.env`（参照 `community/env.example`）：`XPERT_API_URL`、`XPERT_TOKEN`（系统级插件需 SUPER_ADMIN 的登录 JWT）、`XPERT_INSTALL_SCOPE=global` 或组织 ID。
2. 构建后按宿主脚本/部署命令安装（系统级安装见仓库 AGENTS 指引；或 `plugin:deploy:local --plugin-dir community/apps/ontoagent --scope <tenant-or-organization> --api-url <api-origin>`）。需要重启则重启宿主。
3. 在插件配置中填入 Auto API 地址/令牌与镜像目录。
4. 验证插件已加载 → 从 **OntoAgent Governed Context Assistant** 模板创建助手 → 画布中确认中间件节点与只读工具 → 打开 OntoAgent 工作台执行首次同步。
5. 业务闭环：同步 → 审查版本/排除项 → 助手提问 → 回答（含版本证据）→ Workbench 确认/拒绝 → 刷新后可找回记录。

异常路径：未配置凭证同步显式失败（`auto_config_missing`）；Auto 离线返回 `offline` 且旧镜像标 `stale`；首次未同步时助手明确提示 `auto_snapshot_missing`，不编造口径。

## 复用来源与许可

| 来源 | 许可 | 方式与改动 |
|---|---|---|
| 本人项目 OntoAgent（`@ontoagent/dsh-*`，未发 npm） | 自有代码，随本 PR 按仓库 AGPL-3.0 公开 | vendor 至 `src/lib/vendor/`：`dsh-ontology-core`（全量）、`dsh-ontology-store`、`dsh-auto-ontology-adapter`、`auto-pipeline.ts`（服务类型收窄为 `AutoContextService`，类型抽自 `pipeline.ts`）；`relation-retrieve.ts` 一处显式类型断言以兼容 `strictNullChecks:false`。DSH 专属件（ledger/host-adapter/memory/legacy gate）不带入 |
| NVIDIA/auto-ontology | Apache-2.0 | 仅部署为治理上游（基线 `fc43a82`），不复制代码 |
| `community/apps/sales-ontology`、`community/apps/dockyard` | AGPL-3.0 | 参照插件模块/中间件/视图/模板结构与远程视图构建方式，未整段复制业务代码 |

## 验证状态与已知限制

- 已验证：构建、类型检查、3 项业务行为测试、harness 生命周期、元数据与实体表名静态检查。
- 待验证（将在 PR 更新）：真实 Auto 在线同步 smoke、Xpert 平台内安装与完整业务流程、保存恢复与失败重试实测、运行截图（对话/视图/画布/工具调用）。
- 已知限制：Judge/Jev 重排端口未实现（dense 可选、词法默认）；`auto-clarify-v1` 默认关闭（上游第三组 unseen 66.7% FAIL 历史）；多主体只读传递（P1）未包含；真实模型 A/B 复测待执行。

## 基线

- xpert-ai/xpert main `ba8736c897474f7db9a261aa5f64d95860bb9f60`
- xpert-ai/xpert-plugins main `9bfa96594a3debbb33f0ba25c7ade49e7d360c8b`
- NVIDIA/auto-ontology `fc43a82600e18b19d159c52023f54f5572f537ac`

运行截图将在平台实测后补于 `docs/images/` 并在此引用。
