# PR 草稿：会后行动项核对与确认工作台

建议标题：`feat(community): add meeting action review workbench`

目标：`xpert-ai/xpert-plugins:main`；来源：个人 Fork 的 `feat/meeting-action-review`。本文是待审阅草稿，尚未创建 PR。下方正文链接使用个人 Fork 的功能分支地址，供推送后使用；当前未推送，不能视为远程可访问性验证。创建 PR 时建议将 URL 中的分支名替换为最终功能 commit SHA，避免提交正文中的相对路径解析错误。

---

会议整理者需要从混杂建议、承诺和取消安排的文本中整理可核对的行动项。本插件在 Xpert 内完成“提交原文 → AI 提取并提供依据 → 人工编辑 → 确认保存 → 历史恢复”，让 AI 草稿与人工确认结果保持区分。

## 实现与范围

- 独立 tenant 级业务插件 @xpert-ai/plugin-meeting-action-review，版本 0.1.5；稳定命名空间 meeting_action_review。
- 一个主 Agent、一个中间件、两个业务工具、一个 Remote Workbench。会议与分析尝试两张表保存输入、AI 初始结果、人工清单及执行引用。
- 服务端后台分析；支持保存前撤销最近移除、直接确认最新编辑、失败后同记录重试，以及幂等/修订号/过期尝试保护。
- 提交提取后同步既有分析会话，历史项同步最近尝试；插件内切换先处理未保存编辑，后台完成不抢焦点。
- 不做任务派发、多人协作、文件解析或确认后修订；不修改 Xpert 平台源码，不接管平台原生停止/恢复。

## 材料入口

- [README 与真实截图](https://github.com/Yukixieyuya821/xpert-plugins/blob/feat/meeting-action-review/community/apps/meeting-action-review/README.md)
- [需求与页面方案](https://github.com/Yukixieyuya821/xpert-plugins/blob/feat/meeting-action-review/docs/meeting-action-review-plan.md)、[开发设计](https://github.com/Yukixieyuya821/xpert-plugins/blob/feat/meeting-action-review/docs/meeting-action-review-development-design.md)、[数据库设计](https://github.com/Yukixieyuya821/xpert-plugins/blob/feat/meeting-action-review/docs/meeting-action-review-database-design.md)
- [验证记录](https://github.com/Yukixieyuya821/xpert-plugins/blob/feat/meeting-action-review/community/apps/meeting-action-review/docs/verification.md)、[会话同步验收](https://github.com/Yukixieyuya821/xpert-plugins/blob/feat/meeting-action-review/docs/meeting-action-review-chat-sync-validation.md)
- [演示步骤](https://github.com/Yukixieyuya821/xpert-plugins/blob/feat/meeting-action-review/community/apps/meeting-action-review/docs/demo.md)、[AI 协作说明](https://github.com/Yukixieyuya821/xpert-plugins/blob/feat/meeting-action-review/community/apps/meeting-action-review/docs/ai-collaboration.md)、[完整交付清单](https://github.com/Yukixieyuya821/xpert-plugins/blob/feat/meeting-action-review/docs/meeting-action-review-delivery-checklist.md)

## 验证

- 构建、两端类型检查及 dist 一致性检查通过；plugin-dev-harness 从 dist 加载、启动和销毁通过。
- 0.1.5 自动化用例：领域 5、契约 3、隔离 PostgreSQL 11、构建产物模拟宿主 UI 8，共 27 项通过。
- 0.1.4 已完成真实模型提取、依据定位、人工增删改、保存、直接确认最新内容与刷新恢复；有受控失败后同记录重试的真实证据。
- 0.1.5 已通过真实平台提交同步、连续历史配对、未保存保护、保存刷新、最新尝试、返回/前进及后台不抢焦点验证；安装描述符 loaded。
- 未覆盖真实第二账号对抗、在途 API 重启、最大输入、复杂替换语义和长期负载；不将模拟测试当作完整平台验收。
- 元数据静态来源扫描不能识别既有 Zod 校验后的 package.json 来源；运行时 metadata 契约与实际加载通过。实体表名检查通过并带静态识别提示。

## 版本与复用

插件 main 开发基线：`60794aa72edb1fddffebd5e5d071619b8c29014b`；实际平台/镜像核对 SHA：`83e0d4ce9462996e7a4c24517f63559bedf23b7e`，Xpert 与 SDK/contracts 3.29.1。功能提交 SHA 在实际提交后补充。

界面复用本仓库 @xpert-ai/plugin-shadcn-ui；布局参考智能维保，桥接参考 Meetings。业务流程独立实现，遵循仓库 AGPL-3.0 许可。构建采用 community pnpm workspace；不引入其他 checkout 的 UI 组件，不提交真实凭据。
