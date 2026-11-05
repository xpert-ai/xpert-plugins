# 发票报销预审应用智能体协作指引 (AGENTS.md)

本文档面向在 `@xpert-ai/plugin-invoice-reimbursement` 插件工程中协助开发、审查或迭代的智能体（Agent）及开发者。

---

## 一、业务术语与定义规范

在编写代码、提示词、注释及文档时，统一遵循以下业务术语：

- **业务应用（Agentic App）**：指运行在 Xpert 平台上的端到端业务闭环插件，包含工作台界面、服务端模块、智能体中间件和助手模板，而非孤立的对话机器人。
- **发票报销预审工作台（Workbench View）**：用户进行发票录入、结构化查看、在线核验修改和历史台账检索的交互界面。
- **人机在环（Human-in-the-loop）**：财务与发票数据的核心交互原则，系统提取与校验仅作为辅助，必须由人工在界面核对、选择归属部门与事由并最终拍板归档。
- **合规风险等级（Compliance Risk Level）**：
  - `PASS`（完全合规）：发票要素齐全，税号与公司档案完全匹配，价税核算无差错；
  - `WARN`（需补材料/核对）：金额存在尾差，或包含餐饮招待、烟酒等需附随行人员及招待说明的敏感品目；
  - `FAIL`（校验失败）：输入非发票内容或关键要素缺失，触发友好拦截。

---

## 二、架构设计与工程约束

### 1. 数据表与实体命名
- 插件的 `artifactNamespace` 为 `invoice_reimbursement`。
- 所有 TypeORM 实体数据表名称**必须且只能**以 `plugin_invoice_reimbursement_` 为前缀（例如：`plugin_invoice_reimbursement_record`），严禁使用其他前缀，以满足仓库代码合规检查脚本要求。

### 2. 服务端模块划分
- **Service 层 (`invoice-reimbursement.service.ts`)**：实现发票核心提取规则、价税平衡校验、税号对比规则，以及发票记录的增删查改。必须兼顾真实数据库与内存降级存储，保证在脱离真实数据库的环境（如单测或 Harness 测试）下亦能正常运行。
- **Middleware 工具层 (`invoice-reimbursement.middleware.ts`)**：通过 `@langchain/core/tools` 暴露显式工具（`parse_and_audit_invoice`、`save_invoice_reimbursement`、`query_reimbursement_ledger`），工具参数必须使用严格的 Zod 模式约束。
- **View Provider 视图层 (`invoice-reimbursement-view.provider.ts`)**：提供工作台主视图配置（`agent.workbench.main` 与 `agent.workbench.fixed` 插槽），采用 `remote_component` 类型和 `iframe` 沙箱隔离机制加载前端资源。

---

## 三、开发与代码编写规则

1. **语言与表达**：
   - 面向操作人员的界面展示、提示文案、产品文档统一使用**规范简洁的简体中文**；
   - 代码中的类名、方法名、接口字段、环境变量及命令行指令保持英文标准命名。
2. **测试与质量保证**：
   - 每次修改核心业务逻辑后，必须运行 `pnpm --filter @xpert-ai/plugin-invoice-reimbursement run test` 确保无类型错误且单测全部通过；
   - 提交前必须执行官方生命周期测试工具：
     ```bash
     node plugin-dev-harness/dist/index.js --workspace ./community --plugin @xpert-ai/plugin-invoice-reimbursement
     ```
     确保入口装载、模块启动（`onStart`）、初始化（`onPluginBootstrap`）、销毁（`onPluginDestroy`）均正常退出。

---

## 四、安全与信息边界

1. **严禁硬编码敏感信息**：
   - 不得在代码、测试用例、配置文件或示例中硬编码任何真实企业的商业密钥、私有凭据或生产环境鉴权 Token；
   - 企业名称与税号仅使用合规示例（如：`某某科技有限公司`、`91110108MA00000000`）。
2. **文档真实性原则**：
   - 严禁在 README 或交付材料中宣称未实际实现或无法跑通的功能；
   - 明确区分已验证功能（本地规则解析、税号合规对比、台账存储）与未验证功能（国家税务局底账专网直连）。
