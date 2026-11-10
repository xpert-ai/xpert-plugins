# Resume Screening

简历初筛 Agentic App 插件（Xpert 面试作品，开发中）。

> 状态：选题已定为简历初筛，骨架尚未实现。本分支 `feat/resume-screening` 仅含本文档，
> 后续提交按“骨架 → 规则预筛 → AI 打分 → Workbench 确认保存 → 测试与真平台验证”递进。
> 此前 Listing 选题已暂停，分支由 `feat/listing-compliance-check` 改名而来，旧说明已替换。

## 选题：为什么是它

- **目标用户**：中小公司 HR / 招聘负责人，一次收到几十上百份简历，要先筛出一批约面试的人。
- **原有工作方式与痛点**：一份一份打开简历，对着 JD（Job Description，岗位要求）逐条核对，
  慢、标准不统一、筛完的理由没留下来，换个人复核要重来一遍。
- **AI 的作用**：确定性规则先筛硬条件（年限、学历、必备技能缺失等），
  模型只做判断与打分（按 JD 的 5 个维度给分、每维一句话理由、总分排序），
  最终由人在 Workbench 确认“约面试 / 待定 / 淘汰”，可改分、可写备注。
- **为什么 2–6 小时做得完**：只做一条闭环、一个岗位、只做文本简历，
  不做图片简历解析、多岗位、多智能体、自动发面试邀请。
- **为什么是我能讲的题**：做过招聘系统从 0 到 1（需求发起至入职闭环，Moka 历史全量迁移），
  知道 HR 真正的筛人动作是什么，不是从外面猜的。

## 核心流程（最小完成范围）

1. 创建筛查单：输入岗位名称、JD 文本（职责 + 任职要求）、上传或粘贴 2–3 份演示简历（均为虚构数据）。
2. 规则预筛：服务端确定性检查硬条件，不符合的先标出（附规则编号与原文证据），不直接淘汰，只降权。
3. AI 处理：助手调用工具，逐份简历按 5 个维度打分（经验匹配、技能匹配、项目相关度、稳定性、加分项），
   每维 0–20 分，总分 100 分，附每维一句话理由，输出结构化 JSON。
4. 人工确认：Workbench 里按总分排序，逐份确认 / 改分 / 写备注 / 改结论（约面试 / 待定 / 淘汰）。
5. 保存与恢复：保存后刷新或重新进入，能找回筛查单、JD、每份简历的分数与确认结论。
6. 失败重试：模型或保存失败时显示可理解的原因，重试不重复建单、不重复保存（按 screeningId + candidateId 幂等）。

## 功能取舍

- 做：文本 JD + 文本简历、5 维打分、排序、人工确认、保存恢复、失败重试。
- 不做：PDF/图片简历解析、自动发面试邀请、人才库、多岗位对比、权限分级。
- 演示数据全部虚构，不含真实个人信息；JD 以 Java 高级开发为例（5 年以上、JVM、Spring、MySQL 等）。

## 成本：Token 测算

一份简历约输入 3400 token（JD 约 800 + 简历约 1800 + 提示词与工具定义约 800）、输出约 500 token。
按 DeepSeek Flash（非高峰输入 $0.15、输出 $0.60 每百万 token）约 $0.0008，合 0.006 元；
高峰约 $0.0016，合 0.012 元。100 份约 0.6–1.2 元。省 token 的做法：
一份一份调、不把历史简历留在对话里、输出只出分数与一句话理由、硬条件先用规则筛。

## 实现计划（脚手架 + 最小模板参照）

- 先用仓库脚手架生成骨架：`pnpm create:package --scope apps --name resume-screening`
  （注意：该脚本只生成通用占位包，仍需按业务应用补齐能力），再参照全仓最小的 Agentic App
  `community/apps/procurement-quote-comparison`（340K）补齐业务能力，不直接复制其业务代码。
- `src/index.ts`：`XpertPlugin` 入口，`level: 'system'`，`targetApps: ['data-xpert']`，
  `artifactNamespace: 'resume_screening'`（同时写进 `package.json` 的
  `xpert.plugin.artifactNamespace`，`meta.version/level/artifactNamespace` 从 `package.json` 派生，
  按仓库 `AGENTS.md` 跑 `node scripts/check-plugin-metadata.mjs --package` 核对），
  `types: ['workbench-view', 'assistant-tool', 'business-app']`。
- `src/lib/resume-screening.plugin.ts`：`@XpertServerPlugin` 注册实体、服务、中间件、视图。
- `src/lib/resume-screening.middleware.ts`：助手工具（zod 严格 schema）：
  `prescreenResume`（确定性硬条件）、`scoreResume`（AI 打分保存）、`confirmScreening`（人工确认）。
- `src/lib/resume-screening.service.ts`：业务服务与持久化，失败状态与重试幂等。
- `src/lib/entities/`：`ResumeScreening`、`ResumeCandidate`、`ResumeScore`
  （表名经 `pluginArtifactTableName` 生成，`plugin_resume_screening_*`）。
- `src/lib/resume-screening-view.provider.ts` + Remote Component：Workbench 确认视图，
  用 `@xpert-ai/plugin-shadcn-ui` 共享组件，文案放 `remote/locales/<locale>.json`，
  不用原生控件、不在 JSX 里写双语文案分支（仓库 `AGENTS.md`）。
- `src/xpert-resume-screening-assistant.yaml` + templates：助手模板（工具、提示词、starter 问题）。
- `tests`：规则单测（硬条件边界）、打分保存/恢复、失败重试不重复。

## 基线版本（开始开发时 main）

- 插件仓库 `xpert-ai/xpert-plugins` main：`9bfa96594a3debbb33f0ba25c7ade49e7d360c8b`
- 平台仓库 `xpert-ai/xpert` main：`ba8736c897474f7db9a261aa5f64d95860bb9f60`
- Skills 仓库 `xpert-ai/xpert-skills` main：`4ad12dcc9292d9b05021d4f5b93f24865c99e811`

## 验证计划

- [ ] `pnpm --filter @xpert-ai/plugin-resume-screening build`
- [ ] `pnpm --filter @xpert-ai/plugin-resume-screening test`
- [ ] `plugin-dev-harness` 生命周期测试（加载 / 初始化 / 销毁）
- [ ] 本地 Xpert 真平台验证：完整流程 + 保存恢复 + 失败重试截图（待平台环境就绪）
- [ ] PR 描述附基线 SHA、测试结果、截图（相对路径放本目录 README）

## 已知限制 / 待核验

- 本机暂无 Docker，Xpert source-hybrid 本地平台尚未跑通，真平台验证待补。
- 模型不由平台免费提供：平台只提供“模型提供商”配置入口，模型本身与费用需自带 Key
  （候选：已在用的 DeepSeek Flash，需确认测试实例支持该提供商）。
- pnpm 已按仓库要求装为 8.15.8。
- 演示简历全部虚构；只做文本，不做 PDF/图片解析。

## 复用说明

- 结构参照 `procurement-quote-comparison`（AGPL-3.0，同仓），按本选题重写业务逻辑、实体与文案。
- 不复用已在仓内的 `dockyard`（0.4.1，他人面试作品，未完成最终验收且依赖宿主改动）。
- 开发工具：Muse + Codex/Claude Code 按需选用，过程与选择见 PR 描述的 AI 协作说明。
