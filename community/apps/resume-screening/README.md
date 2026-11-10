# Listing Compliance Check

Amazon Listing 合规预检 Agentic App 插件（Xpert 面试作品，开发中）。

> 状态：选题与计划已定，骨架尚未实现。本分支 `feat/listing-compliance-check` 仅含本文档，
> 后续提交按“骨架 → 规则预检 → AI 改写建议 → Workbench 确认保存 → 测试与真平台验证”递进。

## 选题：为什么是它

- **目标用户**：Amazon US 中小跨境卖家，自己写标题、五点、描述并上架。
- **原有工作方式与痛点**：凭经验逐条核对平台规则，标题超长被截断、含违禁词或重复词时
  搜索抑制不发通知，改完也不知道是否合规，只能等流量掉下来才发现。
- **AI 的作用**：确定性规则先查可验证项（长度、违禁词、重复、缺失字段），
  模型只做判断与改写建议（给出改写后的标题/五点及每条理由），最终由人在 Workbench 确认、编辑或驳回。
- **为什么 2–6 小时做得完**：只做一条闭环、一个站点（Amazon US）、只做文本，
  不做图片、库存、价格、多智能体、多端适配。

## 核心流程（最小完成范围）

1. 创建检查单：输入 ASIN（可选）、标题、五点（最多 5 条）、描述、搜索词。
2. 规则预检：服务端确定性检查，逐条出 finding（级别：error / warning，含规则编号与原文证据）。
3. AI 处理：助手调用工具，对 error / warning 给出改写建议（逐条、可采纳、可编辑）。
4. 人工确认：Workbench 里逐条确认 / 修改 / 驳回，确认后保存为一个 revision。
5. 保存与恢复：保存后刷新或重新进入，能找回检查单、finding 与已确认的 revision。
6. 失败重试：模型或保存失败时显示可理解的原因，重试不重复建单、不重复保存（按 caseId + revision 幂等）。

## 功能取舍

- 做：标题 75 字符上限（Amazon 2025 年 200 字符版已作废，2026-07-27 起为 75 字符）、
  违禁词表（可配置）、重复词、五点条数与长度、必填缺失。
- 不做：图片合规、价格/库存、其他站点、自动上架回写 Amazon、付费与权限分级。
- 规则表放插件配置，可改；规则本身不声称是 Amazon 官方全文，以插件内规则版本为准。

## 实现计划（脚手架 + 最小模板参照）

- 先用仓库脚手架生成骨架：`pnpm create:package --scope apps --name listing-compliance-check`
  （见仓库附录一与 `community/AGENTS.md`），再参照全仓最小的 Agentic App
  `community/apps/procurement-quote-comparison`（340K）补齐业务能力，不直接复制其业务代码。
- `src/index.ts`：`XpertPlugin` 入口，`level: 'system'`，`targetApps: ['data-xpert']`，
  `artifactNamespace: 'listing_compliance_check'`（同时写进 `package.json` 的
  `xpert.plugin.artifactNamespace`，`meta.version/level/artifactNamespace` 从 `package.json` 派生，
  按仓库 `AGENTS.md` 跑 `node scripts/check-plugin-metadata.mjs --package` 核对），
  `types: ['workbench-view', 'assistant-tool', 'business-app']`。
- Workbench 远程视图用 `@xpert-ai/plugin-shadcn-ui` 共享组件，文案放 `remote/locales/<locale>.json`，
  不用原生控件、不在 JSX 里写双语文案分支（仓库 `AGENTS.md`）。
- `src/lib/listing-compliance-check.plugin.ts`：`@XpertServerPlugin` 注册实体、服务、中间件、视图。
- `src/lib/listing-compliance-check.middleware.ts`：助手工具（zod 严格 schema）：
  `checkListingRules`（确定性）、`saveAiSuggestions`、`confirmRevision`。
- `src/lib/listing-compliance-check.service.ts`：业务服务与持久化，失败状态与重试幂等。
- `src/lib/entities/`：`ListingCheckCase`、`ListingCheckFinding`、`ListingRevision`
  （表名经 `pluginArtifactTableName` 生成，`plugin_listing_compliance_check_*`）。
- `src/lib/listing-compliance-check-view.provider.ts` + Remote Component：Workbench 确认视图。
- `src/xpert-listing-compliance-check-assistant.yaml` + templates：助手模板（工具、提示词、starter 问题）。
- `tests`：规则单测（长度边界 75/76、违禁词、重复）、保存/恢复、失败重试不重复。

## 基线版本（开始开发时 main）

- 插件仓库 `xpert-ai/xpert-plugins` main：`9bfa96594a3debbb33f0ba25c7ade49e7d360c8b`
- 平台仓库 `xpert-ai/xpert` main：`ba8736c897474f7db9a261aa5f64d95860bb9f60`
- Skills 仓库 `xpert-ai/xpert-skills` main：`4ad12dcc9292d9b05021d4f5b93f24865c99e811`

## 验证计划

- [ ] `pnpm --filter @xpert-ai/plugin-listing-compliance-check build`
- [ ] `pnpm --filter @xpert-ai/plugin-listing-compliance-check test`
- [ ] `plugin-dev-harness` 生命周期测试（加载 / 初始化 / 销毁）
- [ ] 本地 Xpert 真平台验证：完整流程 + 保存恢复 + 失败重试截图（待平台环境就绪）
- [ ] PR 描述附基线 SHA、测试结果、截图（相对路径放本目录 README）

## 已知限制 / 待核验

- 本机暂无 Docker，Xpert source-hybrid 本地平台尚未跑通，真平台验证待补。
- pnpm 尚未安装，构建验证待补。
- 模型凭证与有插件安装权限的测试账号待确认。
- Amazon 规则以插件内规则表版本为准，不声称覆盖官方全部规则。

## 复用说明

- 结构复用 `procurement-quote-comparison`（AGPL-3.0，同仓），按本选题重写业务逻辑、实体与文案。
- 开发工具：Muse + Codex/Claude Code 按需选用，过程与选择见 PR 描述的 AI 协作说明。
