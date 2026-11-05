# AI 测试用例工作台 · Xpert 面试作品

在 Xpert 工作台里把**一条需求**交给助手，AI 生成结构化测试用例草稿，用户逐条核对、编辑后**确认保存**，刷新或重进仍在。覆盖题目要求的最小闭环：明确用户 → 一条核心流程 → 可操作界面 → 一次真实 AI 处理 → 结果保存与恢复 → 一个失败重试场景。

**交付状态**：业务逻辑通过 11 条自动化单测；远程界面与助手模板通过构建校验（`build` + `verify:dist`）。真实模型调用、平台内安装加载与浏览器业务流程验收需在测试平台完成，见 [验证记录](docs/interview/03-validation.md)，未验收处不写"通过"。

## 它解决什么问题

目标用户是需要把需求快速转成用例、又要留痕复核的测试/开发人员。原方式在文档、聊天和用例系统之间来回复制：格式不统一、AI 一次性输出难落到自己系统、重试会重复生成。本工作台让"需求 → AI 草稿 → 人工确认"成为一条可保存、可恢复、可重试的业务流程；AI 负责起草，人负责判定，数据保存在插件数据库并按用户/助手隔离。

## 面试材料

| 内容 | 文档 |
| --- | --- |
| 用户、痛点、业务流程、关键页面与功能取舍 | [产品说明](docs/interview/01-product.md) |
| 环境、构建、安装、配置与操作步骤 | [运行说明](docs/interview/02-runbook.md) |
| 四层验证、单测证据、真实模型待补部分 | [验证记录](docs/interview/03-validation.md) |
| AI 工具协作、代表性决策与复盘 | [AI 协作说明](docs/interview/04-ai-collaboration.md) |
| 基线 SHA、许可、复用范围与 Git 状态 | [来源与交付](docs/interview/05-sources.md) |
| 任务书逐项对照、已知限制与 PR 提纲 | [交付与缺口](docs/interview/06-gaps-and-pr.md) |
| 部署环境变量示例（脱敏） | [deploy.env.example](docs/interview/deploy.env.example) |

## 实际运行截图

> 需在测试平台安装后补入 `docs/images/`（随代码提交、用相对路径引用，保证在 GitHub 直接显示）。当前为占位说明，未截图处不以原型图充当运行证据。

- `docs/images/01-requirement-saved.png`：保存需求后，用例列表显示"暂无用例"的空状态。
- `docs/images/02-drafts-from-ai.png`：AI 生成后工作台出现带 P0–P3 与步骤/预期的草稿用例（状态"草稿"）。
- `docs/images/03-restored-after-reload.png`：刷新或重进应用后，已确认用例从数据库读回。
- `docs/images/04-failure-retry.png`：模型/写库失败时的可理解提示与"重试"，重试不重复生成。

## 目录结构

```
src/index.ts                  插件元信息、应用市场条目、注册入口
src/lib/constants.ts          命名空间、Provider/View/工具/动作等固定标识
src/lib/domain/contracts.ts   zod 业务契约、错误码、作用域
src/lib/domain/workbench-store.ts  框架无关的业务规则（可独立单测）
src/lib/workbench.entity.ts   typeorm 表（按完整作用域唯一）
src/lib/workbench.service.ts  Nest 适配：把 store 接到插件数据库
src/lib/workbench-view.provider.ts  Workbench 视图清单、数据查询、动作分派
src/lib/workbench.middleware.ts     暴露 testcase_persist_draft 工具给助手
src/lib/templates.ts + src/testcase-assistant.yaml  助手模板 DSL
src/lib/remote/main.ts        iframe 内远程界面（与宿主桥接）
scripts/ tests/               构建脚本与单测
```

## 快速上手（本地/测试平台）

```bash
# 在宿主（xpert 平台）仓库根目录，或 community 工作区内
corepack enable
pnpm install
pnpm --filter @community/apps-testcase-workbench build
pnpm --filter @community/apps-testcase-workbench test      # 构建 + 单测 + dist 校验
```

部署到测试平台、创建助手、走通业务流程见 [运行说明](docs/interview/02-runbook.md)。

## 源码与许可

AGPL-3.0，与仓库 `community/apps` 约定一致。未捆绑第三方编辑器或额外开源库；仅复用 Xpert 插件脚手架的工程结构与 `plugin-sdk`/`contracts` 公共 API，并在 `@xpert-ai/plugin-sdk` 提供的 `pluginArtifactTableName`、`ViewExtensionProvider`、`AgentMiddlewareStrategy` 之上实现。详见 [来源与交付](docs/interview/05-sources.md) 与 [第三方声明](THIRD_PARTY_NOTICES.md)。

## 提交方式

本插件功能分支向 `xpert-ai/xpert-plugins` 的 `main` 发起 PR（不合并）。基线 SHA、复现命令与结果见 [来源与交付](docs/interview/05-sources.md) 与 [验证记录](docs/interview/03-validation.md)。
