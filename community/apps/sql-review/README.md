# SQL 质量审查工作台（SQL Review Workbench）

业务应用的 SQL 上线前审查：**确定性规则引擎 + AI 结构化分析 + 人工逐条确认**的完整闭环，以 Xpert 业务应用插件交付。

## 目标用户与痛点

- **用户**：业务系统开发人员 / 初级 DBA（提交方）；资深 DBA（审查方）
- **原有方式**：SQL 上线依赖资深同事人工 review；规范文档存在但没人看；索引缺失、全表扫描、注入风险常到生产才暴露
- **改善**：提交即审查——规则引擎秒级给出**带原文证据**的确定性问题，AI 补充语义分析与改写建议，审查人逐条确认/驳回后归档，形成可追溯的审查档案

## 业务流程

```
开发在助手对话提交 SQL(+DDL) ──► 确定性规则扫描（8条，证据引用）
        │                              │
        ▼                              ▼
  审查单 pending_ai ──AI结构化报告──► pending_confirmation
        │                              │
        │ 失败 → failed ──重试(保留现场)──┘
        ▼                              ▼
   工作台查看 SQL/证据/建议 ──► 逐条 [✓采纳/✗驳回] ──► 终审：confirmed / rejected
```

AI 的角色边界：**助手只产报告，不落终审**——采纳/驳回/终审只能由登录用户在工作台操作（决策与终审不出现在任何 Agent 工具里）。

## 运行截图

| 界面 | 说明 |
|---|---|
| ![审查单列表](docs/screenshot-list.png) | 工作台列表：状态徽章 / AI置信度 / 发现数 / 重试次数 |
| ![审查详情与逐条确认](docs/screenshot-detail.png) | 详情页：SQL 原文、证据引用、解释与建议、逐条采纳/驳回 |
| ![AI 审查结果](docs/screenshot-assistant.png) | 助手对话：真实模型调用产出结构化报告并自动建单 |
| ![失败重试](docs/screenshot-retry.png) | 失败场景：错误信息展示 + 一键重试（保留 SQL 与规则发现） |

## 安装与运行

环境要求：Xpert 开源版（xpert-ai/xpert）运行中，PostgreSQL + Redis 可用，已配置模型供应商（OpenAI 兼容接口均可，开发时使用 MiniMax-M3）。

```bash
# 1) 构建（在插件仓库根目录）
corepack pnpm -C community/apps/sql-review install
corepack pnpm -C community/apps/sql-review build

# 2) 部署到本地平台（宿主根目录；按实际租户/组织与 API 地址调整）
corepack pnpm plugin:deploy:local \
  --plugin-dir <plugin-repo>/community/apps/sql-review \
  --scope <tenant-or-organization> --api-url <api-origin>

# 3) 重启宿主使插件加载；在平台「模板/Assistant 模板」中安装
#    "SQL 质量审查助手"，基于模板创建助手，绑定 sql-review-tools 工具集
#    与 SQL 质量审查工作台视图

# 4) 验证：在助手对话发送一段 SQL，例如
#    "审查这条：UPDATE orders SET status = 1;（mysql）"
```

无插件级环境变量必需项；可选 `SQL_REVIEW_ENABLED=false` 停用、`SQL_REVIEW_MAX_SQL_LENGTH` 调整长度上限。模型凭证在平台侧配置，仓库零密钥。

## 功能取舍（MVP 范围）

- **做**：单条 SQL 审查闭环、规则+AI 双引擎、逐条人工决策、终审归档、失败重试、审查单列表与详情恢复
- **不做**（按需扩展）：多方言深度解析（当前 8 条规则覆盖 PostgreSQL/MySQL 常见模式）、团队权限、定时扫描、批量导入

## 主要实现

| 模块 | 职责 |
|---|---|
| `rules/sql-review-rules.service.ts` | 8 条确定性规则：select-star / 缺WHERE / 前导通配LIKE / 函数包裹列 / 隐式转换 / 注入痕迹 / JOIN无ON / ORDER BY无LIMIT；每条输出**原文证据+位置** |
| `sql-review.service.ts` | 状态机 `draft→pending_ai→pending_confirmation→confirmed|rejected`，`failed→retry`（retryCount/lastError 落库，重试保留 SQL 与规则发现、清除旧 AI 发现） |
| `sql-review.middleware.ts` | 4 个 Agent 工具（zod schema）：submit_case / get_rule_findings / save_ai_report / get_case；**不含任何确认/终审工具** |
| `sql-review-view.provider.ts` | Workbench 视图：列表/详情查询，decide_finding / finalize_case / retry_case 动作（仅登录用户） |
| `remote-components/main/app.js` | 工作台界面（React 远程组件，无构建步骤）：列表、SQL 与证据展示、逐条决策、终审、失败重试 |
| `xpert-sql-review-assistant.yaml` | 助手模板：审查员人设；纪律——不得宣称 SQL 已通过、AI 发现必须引用原文证据、工具失败如实告知可重试 |

## 验证结果

| 项目 | 结果 |
|---|---|
| TypeScript 编译（`tsc -p tsconfig.lib.json --noEmit`） | ✅ 零错误 |
| 规则引擎单测（`jest`，13 用例：正例/反例/畸形SQL/严重度排序） | ✅ 13/13 通过 |
| 平台部署加载（Docker 开源版 + 重启） | ✅ 已验证：安装 state=loaded，重启后自动加载激活 |
| 六步端到端（模板→建助手→绑工具→真实模型调用→保存） | ✅ 已验证（API层）：真实 MiniMax-M3 调用全部四个工具；审查单 SR-20261108-UBFXI 落库 pending_confirmation；规则发现1条(high,带证据)+AI增量4条(无复述，符合纪律) |
| 失败重试 / Web UI 截图 | ⬜ 待补（retry 动作已实现并注册；截图位 docs/） |

基线版本：xpert@`ba8736c897474f7db9a261aa5f64d95860bb9f60`、xpert-plugins@`9bfa96594a3debbb33f0ba25c7ade49e7d360c8b`（开发与测试基线）。

## 复用说明

- 工程骨架（package.json / project.json / tsconfig / jest / copy-assets 脚本）参照同仓库 `community/apps/smart-maintenance`（AGPL-3.0，同仓库内复用）
- 远程组件桥接协议（postMessage channel/protocolVersion/init-request 流程）遵循平台 Remote Component 规范，参照同示例的消息模式实现
- 业务代码（规则引擎 / 领域服务 / 中间件 / 实体 / 视图 / 界面）为本作品原创；无新增第三方运行时依赖（zod/typeorm/nestjs 均为平台 peer 依赖）
