# 面试要求逐项对照、已知限制与 PR 提纲

---

## 一、 面试任务书要求逐项对照表

| 序号 | 任务书核心要求 | 对应材料与落地证据 | 达标结论 |
| :---: | :--- | :--- | :---: |
| **1** | **明确目标用户与业务问题** | 详见 [01-product.md](01-product.md)，聚焦客服、售后技术支持在处理多渠道凌乱客诉时的提炼、打标与回复痛点。 | **完全达标** |
| **2** | **可操作的交互界面 (Workbench)** | 实现了双栏响应式 Remote Component 视图（`app.js`），支持工单卡片筛选、分类修改、情绪调整与回复润色。 | **完全达标** |
| **3** | **一次真实 AI 处理** | 提供了 `ticket_analyze_and_draft` 工具，自动化提取问题意图、紧急度 P0-P3、情绪倾向、摘要与安抚回复。 | **完全达标** |
| **4** | **结果保存与恢复 (持久化)** | 基于 TypeORM 实体 `plugin_smart_ticket_record` 落库，刷新页面或重启后通过 `getViewData` 完整恢复。 | **完全达标** |
| **5** | **失败重试场景** | 支持输入长度校验拦截（`CONTENT_TOO_SHORT`）与模拟上游服务超时（`SIMULATED_SERVICE_TIMEOUT`），提供一键重试且幂等。 | **完全达标** |
| **6** | **多层分级测试** | 9 项自动化单元测试全部通过（0 失败），实体命名规范检查通过，严格 TypeScript 类型检查通过。 | **完全达标** |
| **7** | **运行说明与环境配置** | 详见 [02-runbook.md](02-runbook.md)，提供环境要求、构建命令、安装六步核对表及环境变量示例。 | **完全达标** |
| **8** | **AI 协作说明** | 详见 [04-ai-collaboration.md](04-ai-collaboration.md)，分享 5 项关键工程决策与技术选型思考。 | **完全达标** |
| **9** | **Git 规范与 PR 交付** | 功能分支 `feat/smart-ticket-agentic-app`，改动严格收敛在插件目录内，PR 指向官方 `main` 分支。 | **完全达标** |

---

## 二、 已知限制与后续演进方向

1. **大模型在线联调与 Prompt 调优**：当前规则引擎与大模型提示词已完备，可根据不同行业领域（如电商、SaaS、医疗）进一步微调垂类专业话术。
2. **外部工单系统对接（Webhook）**：后续可在工单归档后触发 Webhook，自动同步至飞书多维表格、钉钉工作台或外部 Jira / Zendesk 平台。
3. **批量工单导入与智能合并**：当前支持单条客诉快速录入与分析，后续可支持批量 Excel / CSV 导入并自动聚类相似客诉。

---

## 三、 PR 标题与描述模板（可直接用于 GitHub 提交）

### PR Title:
```text
feat(community): add smart-ticket agentic app plugin
```

### PR Description:
```markdown
## Summary
本项目为 Xpert 业务应用开发面试实作作品：**智能客诉工单工作台（Smart Ticket Agentic App）**，以独立插件形式交付于 `community/apps/smart-ticket`。

本插件为客服、售后支持与运营团队打造了一个从**客诉输入 -> AI 提取（分类、P0-P3优先级、情绪极性、摘要、回复草稿） -> 工作台人工核验微调（Human-in-the-loop） -> 持久化确认归档 -> 刷新数据恢复 -> 异常重试**的完整业务闭环。

## Key Deliverables & Implementation
1. **产品说明**：详见 `docs/interview/01-product.md`，包含用户痛点、业务流程图与双栏工作台交互原型。
2. **业务逻辑与数据存储**：
   - TypeORM 实体 `plugin_smart_ticket_record`，符合官方实体命名检查规范；
   - `TicketService` 实现客诉意图分析、紧急度判定、情感极性评估、回复草稿生成、人工微调保存与幂等重试。
3. **智能体中间件 (Agent Tools)**：
   - `SmartTicketMiddleware` 暴露 `ticket_analyze_and_draft`、`ticket_confirm_and_save`、`ticket_list_records` 三个标准 LangChain 工具。
4. **工作台远程组件 (Workbench Remote Component)**：
   - `TicketViewProvider` 挂载 `smart-ticket.workbench` 视图（支持 `agent.workbench.fixed` 与 `agent.workbench.main`）；
   - 基于 React iframe 隔离架构的交互式前端（`app.js`），支持工单过滤、字段编辑、状态流转与引用至聊天。
5. **助手模板 (YAML DSL)**：
   - 随包提供 `smart-ticket-assistant.yaml`，开箱即用一键创建智能客诉工单助手。
6. **自动化测试覆盖**：
   - 9 项单元与集成测试全量 PASS（覆盖核心业务流、校验拦截、异常重试、人工确认、权限隔离与 Manifest 校验）。

## Verification & Baseline
- **Xpert 平台基线 SHA**: `ba8736c897474f7db9a261aa5f64d95860bb9f60`
- **xpert-plugins 基线 SHA**: `9bfa96594a3debbb33f0ba25c7ade49e7d360c8b`
- **测试环境**: Node.js `v20.20.0`, pnpm `12.18.0` / `8.15.8`
- **测试结果**: 9 passed, 0 failed, 严格 TypeCheck 通过，实体命名校验通过。

## Interview Materials
- [产品说明](docs/interview/01-product.md)
- [运行说明与部署步骤](docs/interview/02-runbook.md)
- [测试验证与证据](docs/interview/03-validation.md)
- [AI 开发协作复盘](docs/interview/04-ai-collaboration.md)
- [基线来源与许可声明](docs/interview/05-sources.md)
- [任务书逐项对照表](docs/interview/06-gaps-and-pr.md)
```
