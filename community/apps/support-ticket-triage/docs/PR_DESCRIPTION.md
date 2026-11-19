# PR 描述草稿

## What

新增 Support Ticket Triage Agentic App，用于将自然语言售后问题转成可人工复核的结构化工单分析和回复草稿。

## Business value

减少客服主管逐条阅读、分类和草拟回复的时间，同时保留对退款、换货和赔偿等业务承诺的人工决定权。

## Main implementation

- 租户与组织隔离的 TypeORM 工单实体。
- 创建、读取、列出、保存 AI 分析和记录失败的 Agent Middleware Tools。
- 工单列表和详情 Workbench Remote View。
- 批准、驳回、失败模拟和安全重试状态机。
- 可安装的 Assistant YAML 模板。
- 核心状态与 AI 输出规范化测试。

## Verification

- [x] Domain tests: 5 passed
- [ ] TypeScript typecheck in upstream workspace
- [ ] Plugin build
- [ ] plugin-dev-harness lifecycle test
- [ ] Installed and restarted on Xpert
- [ ] Real model tool call
- [ ] Persistence and retry screenshots

## Baseline

- Xpert commit: `<fill-after-checkout>`
- xpert-plugins commit: `<fill-after-checkout>`
- Tested platform version: `<fill-after-platform-test>`

## Screenshots

平台实测后，将截图放到 `evidence/` 并在这里用相对路径引用：

- 创建与持久化
- Assistant 工具调用
- AI 分析结果
- 人工批准
- 失败与重试

## Known limits

- 本版本不自动执行退款、换货或外部通知。
- 未实现跨组织看板和复杂 SLA 规则。
- 当前交付环境没有可用 Xpert 实例，平台验收项需在提交 PR 前补齐。
