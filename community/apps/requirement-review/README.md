# ReqTrace 需求评审工作台

面向产品经理，将讨论转写整理成有原文依据的需求和验收草稿。产品经理核对、修改和取舍后确认，保存的结果可在重新进入应用后恢复。

## 实现状态

核心流程已实现：创建访谈评审 → 助手提取需求、证据和验收草稿 → 人工核对与取舍 → 保存草稿 → 确认只读快照。分析失败、超时或未发现需求时，可在工作台点击“修改原文”，以当前标题和原文为起点修订后重新分析。服务端持久化原文、原始 AI 草稿、人工草稿与每次分析尝试，处理范围校验、并发分析、重复请求、超时恢复、版本冲突和迟到结果。工作台可展开最近 20 次分析历史，按新到旧展示状态、原文版本、提示词版本、耗时、错误码，以及宿主已上报时的脱敏模型名和 token 用量。

插件为 system 级别，稳定命名空间为 `reqtrace`，两张表为 `plugin_reqtrace_review` 和 `plugin_reqtrace_analysis_attempt`。租户、组织与 owner 来自宿主，服务端强制校验；浏览器与模型不能决定身份。三个助手工具仅允许读取原文、提交 AI 草稿和报告失败，确认操作仅在工作台提供。

使用插件提供的“ReqTrace 需求评审助手”模板并选择已配置模型。在工作台点击“新建评审”，粘贴原文后分析；点击证据定位原文，修改描述和验收条件，解决待澄清问题或排除对应需求，保存后确认。修改原文会明确提示清除当前 AI/人工草稿并增加原文版本；若其他页面已更新，工作台会刷新最新版本而不覆盖。

详细说明：[核心流程](docs/workflow.mdx)、[安装](docs/setup.mdx)、[验证记录](docs/verification.mdx)。

## 本地检查

在 community 工作区运行，遵循其 pnpm 8.15.8 配置：

```powershell
corepack pnpm install --filter @community/apps-requirement-review...
corepack pnpm --filter @xpert-ai/plugin-shadcn-ui build
corepack pnpm --filter @community/apps-requirement-review typecheck
corepack pnpm --filter @community/apps-requirement-review test
```

10 个单元、契约与生产预览状态测试已通过。独立 PostgreSQL 集成测试覆盖并发分析、幂等、失败重试、范围拒绝、版本冲突、确认恢复、失败/空结果修改原文、跨原文版本的尝试历史及迟到提交；只使用随机测试 schema。实际安装、模型流程与截图记录见验证文档。

在插件仓库根目录运行生命周期检查：

```powershell
Push-Location plugin-dev-harness
corepack pnpm install --ignore-workspace
corepack pnpm build
Pop-Location
node plugin-dev-harness/dist/index.js --workspace ./community --plugin @community/apps-requirement-review
```

Harness 使用模拟数据库；构建和加载通过不等于真实持久化、权限、助手执行或业务流程通过。

## 环境基线

- Xpert main：`182f2f4a7d05d968016a9ec20a93833687c4394f`。
- 插件 main：`63a5c222bbaa55921026dbffb858d43e5ec1570f`。
- 宿主 SDK：`3.18.5`；插件以 peerDependency 声明，由宿主提供运行时。
- 本地 Windows 运行时：Node `22.23.2`。

## 复用与协作

工程注册与实体组织参考同仓库 Dockyard，遵循 AGPL-3.0。当前没有移植 VidSnap 或 AMOR 源码。搭建和初始代码由 Codex 辅助完成，具体工具、模型与人工选择在交付阶段补充。

## 验收结果

同一生产 TSX 构建在官方 Preview Host 已完成失败后的原文修订、陈旧版本自动刷新、空结果恢复、重新分析、人工编辑、确认与刷新重开；桌面和手机宽度均已检查。插件也已安装到本地 Xpert，专用助手通过 DeepSeek 实际调用读取原文并提交 4 条证据草稿；人工排除本期未定项、清空待澄清问题并修改描述后，保存了 3 条需求的只读确认快照。刷新页面重新打开后，确认状态、取舍和人工修改均从数据库恢复。

新增恢复入口重新安装后，实际 Xpert smoke test 通过待分析修订、双页面陈旧版本拒绝，以及真实分析超时后的失败修订恢复。超时尝试被安全标记为 `INTERRUPTED / attempt_expired`，修改失败状态的原文后评审恢复为 `READY`，数据库中的 `inputVersion` 增加且旧 AI/人工草稿保持为空。再次触发 DeepSeek 后，模型约 10 秒内成功提交 2 条需求；人工清空待澄清问题、保存并确认，完整刷新后仍从数据库恢复为已确认，最终不可变快照包含 2 条需求。

助手已发布 v2，将递归上限提高到 40，修复首次运行在两个工具成功后仍显示递归上限错误的问题。实际平台截图与分层验证范围见[验证记录](docs/verification.mdx)。

P1 的第一阶段“分析尝试历史”已完成代码、PostgreSQL 与生产 Preview Host 验证，尚未重新安装到实际 Xpert。当前宿主调用路径未提供模型与 token 元数据时，界面明确显示“未上报”，不会由模型工具参数补写这些受信信息。
