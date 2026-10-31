# 企业发票报销智能预审工作台 (Invoice Reimbursement Workbench)

> **Xpert 平台业务应用插件 (Agentic App)** · 独立插件交付 · 遵循 Xpert 官方插件规范

---

## 一、产品说明与业务闭环

### 1.1 目标用户与业务痛点
- **目标用户**：经常提报日常报销的企业员工（如销售、研发、差旅人员），以及企业财务初审专员。
- **原有工作方式与核心痛点**：
  1. **手工逐字录入繁琐低效**：员工报销时需要手动抄写发票代码、发票号码、开票日期、金额、税额等，稍有手滑输错一位，报销流程被打回重走；
  2. **抬头与税号易错导致二次开票**：员工常常忽略开票抬头或输错税号，直到财务月末扎账查验不通过才发现，造成重新开票甚至无法报销；
  3. **特殊品目合规制度易遗漏**：财务规定餐饮、礼品招待等品目必须提供随行人员名单和业务招待说明，普通员工往往不清楚制度要求直接提报，增加财务沟通成本。

### 1.2 核心业务流程闭环
本应用构建了一个包含 **“输入 $\rightarrow$ AI结构化抽取与合规自检 $\rightarrow$ 人机在环核验微调 $\rightarrow$ 持久化归档 $\rightarrow$ 异常重试”** 的完整闭环：

```mermaid
flowchart TD
    A[用户输入: 发票票面文本 / OCR数据] --> B[AI 核心处理: 结构化抽取 + 税号比对 + 敏感品目自检]
    B -->|格式合法| C[Xpert Workbench 视图: 高亮展示要素与合规状态]
    B -->|非发票或文本过短| D[友好拦截报错: 提供幂等重试按钮]
    C --> E[人机在环 (Human-in-the-loop): 员工在线微调金额/归属部门/事由]
    E --> F[点击保存归档: 写入 TypeORM 数据库持久化]
    F --> G[刷新页面 / 切换回溯: 秒级还原历史台账与审核记录]
```

### 1.3 AI 的具体作用与功能取舍
- **AI 的核心作用**：
  1. **非结构化到结构化转化**：准确抽取发票代码、号码、金额、税额、开票日期及双方抬头；
  2. **实时合规风控诊断**：智能比对企业法定税号，校验价税平衡（`不含税金额 + 税额 = 总金额`），针对餐饮招待等敏感品目主动出具预审警示（WARN 级别）。
- **功能取舍（明确设计边界）**：
  - ✅ **做的部分**：自然语言发票要素提取、税号一致性校验、品目合规审查、Workbench 交互表单、TypeORM 持久化、生命周期管理。
  - ❌ **不做的大而全模块**：不做全国增值税发票真伪底账查验 API 直连（需要税务局专网硬件金税盘凭据）；不做企业级网银批量自动打款结算。聚焦于报销前端最卡脖子的“填单预审与合规在环核验”闭环。

---

## 二、应用插件架构与工程结构

本插件完全遵照 Xpert 官方插件规范构建，位于 `community/apps/invoice-reimbursement`：

```text
community/apps/invoice-reimbursement/
├── package.json                   # 声明插件元信息、依赖及 @xpert-ai/plugin-sdk
├── tsconfig.json                  # TypeScript 配置 (继承 tsconfig.base.json)
├── tsconfig.lib.json              # 库编译配置 (NodeNext, ES2022)
├── tsconfig.spec.json             # 单元测试类型检查配置
├── env.example                    # 环境变量模板
├── README.md                      # 核心交付文档
├── assets/                        # 实际运行截图（相对路径引用）
│   ├── 01-workbench-overview.png
│   ├── 02-ai-parsing-compliance.png
│   ├── 03-human-in-the-loop-review.png
│   ├── 04-persistence-and-restore.png
│   └── 05-exception-and-retry.png
├── scripts/
│   └── copy-assets.mjs            # 构建产物资产打包脚本
├── src/
│   ├── index.ts                   # 插件入口 (XpertPlugin 注册、生命周期与元数据)
│   ├── xpert-invoice-reimbursement-assistant.yaml # Assistant 模板与 DSL
│   └── lib/
│       ├── constants.ts           # 常量定义 (Provider Key, View Key, 默认税号)
│       ├── types.ts               # 结构化发票数据类型与 DTO
│       ├── entities/              # TypeORM 实体 (plugin_invoice_reimbursement_record)
│       │   ├── invoice-record.entity.ts
│       │   └── index.ts
│       ├── invoice-reimbursement.service.ts      # 服务端业务逻辑与规则引擎
│       ├── invoice-reimbursement.middleware.ts   # Agent 中间件工具 (供大模型调用)
│       ├── invoice-reimbursement-view.provider.ts# Workbench 视图桥接扩展
│       ├── invoice-reimbursement.plugin.ts       # NestJS 服务端插件定义 (@XpertServerPlugin)
│       ├── invoice-reimbursement.templates.ts    # 助手模板贡献注册
│       └── remote-components/                    # 远程组件实现 (iframe 隔离)
│           └── invoice_reimbursement__remote/
│               └── app.js
└── dist/                          # 编译产物目录
```

---

## 三、运行与安装部署指南

### 3.1 环境要求
- **Node.js**: >= 20.x (测试环境为 Node.js v24.15.0)
- **包管理器**: `pnpm` >= 8.15.x
- **依赖安装**:
  ```bash
  cd F:/xpert-plugins/community
  pnpm install
  ```

### 3.2 构建命令
在插件目录或根工作区执行单包编译构建：
```bash
# 方式 1：通过 pnpm 过滤构建
cd F:/xpert-plugins/community
pnpm --filter @xpert-ai/plugin-invoice-reimbursement run build

# 方式 2：在插件目录下直接构建
cd F:/xpert-plugins/community/apps/invoice-reimbursement
pnpm run build
```

### 3.3 本地 Xpert 平台部署命令
将构建完成的插件产物部署至本地运行的 Xpert 宿主平台：
```bash
corepack pnpm plugin:deploy:local \
  --plugin-dir F:/xpert-plugins/community/apps/invoice-reimbursement \
  --scope default \
  --api-url http://localhost:3000
```

### 3.4 环境变量配置
参考插件目录下的 `env.example` 配置测试基准信息：
```bash
COMPANY_STANDARD_NAME="某某科技有限公司"
COMPANY_STANDARD_TAX_NO="91110108MA00000000"
INVOICE_AUDIT_LOG_LEVEL="info"
```

---

## 四、实际运行截图与操作演示

### 4.1 核心操作界面概览 (Workbench View)
![01-工作台概览](assets/01-workbench-overview.png)
- **说明**：左侧展示历史报销台账，支持按单号切换回溯；右侧为主输入面板，展示系统标准企业税号基准。

### 4.2 AI 智能提取与合规自检 (Extraction & Compliance)
![02-AI智能提取与合规自检](assets/02-ai-parsing-compliance.png)
- **说明**：粘贴发票文本后，AI 自动提取关键要素（发票代码、号码、金额、税额、抬头），价税核算一致且税号完全匹配时给出绿色 `PASS` 徽章。

### 4.3 人机在环核验与微调 (Human-in-the-loop Review)
![03-人机在环核验与微调](assets/03-human-in-the-loop-review.png)
- **说明**：用户在线对识别出的字段进行复核，自主选择【费用分类】、【归属部门】并补充【报销事由】，点击“确认无误，保存并归档”。

### 4.4 数据持久化与历史回溯 (Persistence & Restoration)
![04-数据持久化与历史回溯](assets/04-persistence-and-restore.png)
- **说明**：发票单据持久化存入 `plugin_invoice_reimbursement_record` 数据表中；刷新浏览器后列表数据完整保留，点击任意历史发票可秒级无损还原所有字段。

### 4.5 异常与失败重试机制 (Exception Handling & Retry)
![05-异常与失败重试机制](assets/05-exception-and-retry.png)
- **说明**：输入无意义乱码时，系统主动校验阻断并给出友好错误提示；支持保留原输入并一键幂等重试，重试不会产生脏数据。

---

## 五、验证与测试报告

### 5.1 基线版本信息
- **平台仓库 main 基线 SHA**: `60794aa72edb1fddffebd5e5d071619b8c29014b`
- **插件仓库 main 基线 SHA**: `60794aa72edb1fddffebd5e5d071619b8c29014b`
- **测试环境**: Windows 11 / Node.js v24.15.0 / pnpm 12.10.1

### 5.2 单元测试与代码检查
执行类型检查与用例断言：
```bash
cd F:/xpert-plugins/community
pnpm --filter @xpert-ai/plugin-invoice-reimbursement run test
```
- **测试结果**：
  - `tsc -p tsconfig.spec.json --noEmit` 编译通过（0 error）。
  - 覆盖差旅合规用例、餐饮需补材料预警用例、非法文本拦截用例及 Service 存储获取闭环。

### 5.3 插件生命周期验证 (Plugin Dev Harness)
运行官方专用生命周期测试命令：
```bash
cd F:/xpert-plugins
node plugin-dev-harness/dist/index.js --workspace ./community --plugin @xpert-ai/plugin-invoice-reimbursement
```
- **执行日志输出**：
  ```text
  [plugin-dev-harness] workspace: F:\xpert-plugins\community
  [plugin-dev-harness] plugin: @xpert-ai/plugin-invoice-reimbursement@0.1.0
  [plugin-dev-harness] entry: F:\xpert-plugins\community\apps\invoice-reimbursement\dist\index.js
  [plugin-dev-harness] mocks: enabled
  [plugin-dev-harness][plugin:@xpert-ai/plugin-invoice-reimbursement][log] Register invoice reimbursement plugin
  [Nest] LOG [NestFactory] Starting Nest application...
  [Nest] LOG [InstanceLoader] InvoiceReimbursementPlugin dependencies initialized +0ms
  [plugin-dev-harness][plugin:@xpert-ai/plugin-invoice-reimbursement][log] Invoice reimbursement plugin started
  InvoiceReimbursementPlugin is being bootstrapped...
  [plugin-dev-harness] onPluginBootstrap completed
  [plugin-dev-harness] Plugin loaded successfully.
  InvoiceReimbursementPlugin is being destroyed...
  [plugin-dev-harness] onPluginDestroy completed
  [plugin-dev-harness][plugin:@xpert-ai/plugin-invoice-reimbursement][log] Invoice reimbursement plugin stopped
  [plugin-dev-harness] onStop completed
  [plugin-dev-harness] Application context closed
  ```
- **验证结论**：NestJS 依赖注入、TypeORM 实体注册、插件生命周期（`bootstrap` / `destroy` / `start` / `stop`）均验证通过，无未捕获异常。

### 5.4 仓库实体表结构检查
```bash
cd F:/xpert-plugins
node scripts/check-plugin-entity-tables.mjs --all
```
- **结论**：`plugin_invoice_reimbursement_record` 完全符合 `plugin_<artifactNamespace>_<tableName>` 命名规范，校验通过。

### 5.5 已验证与未验证项说明
- **已验证**：发票数据提取、合规诊断规则、Workbench 视图桥接、TypeORM 存储、生命周期装载与销毁、异常拦截。
- **未验证**：真实国家税务局增值税底账查验硬件接口（属于企业受限凭据，使用本地规则引擎与结构化自检替代）。

---

## 六、AI 协作复盘说明

在本次业务应用开发中，借助 AI 开发工具进行了深度人机协同：
1. **产品与场景梳理**：
   - 面对多选场景，与 AI 共同权衡了“实操落地性”与“闭环可复现性”，果断舍弃了依赖外部券商专用接口的股票交易，选择了业务痛点清晰且标准化的企业发票报销预审。
2. **架构设计与 TypeORM 规范**：
   - 遇到 Xpert 插件对实体表名的严格检查（`plugin_<artifactNamespace>_*`）时，借助 AI 快速分析仓库脚本 `check-plugin-entity-tables.mjs`，在实体定义中准确配置了 `plugin_invoice_reimbursement_record`，一次性通过校验。
3. **分层测试与 Harness 调试**：
   - 使用 AI 协助定位 `plugin-dev-harness` 在 Windows 环境下的依赖构建问题，通过独立依赖准备与编译，成功跑通插件生命周期验证。

---

## 七、已知限制与后续改进

1. **OCR 原件直接识别**：目前采用文本/票面信息提取，后续可集成云端 OCR 模型直接解析 PDF/OFD 发票文件流；
2. **发票查重机制**：当前支持按单号检索，后续可引入多维度联合唯一索引（发票代码 + 发票号码）防止员工二次重复报销；
3. **对接企业 ERP/OA**：后续可拓展 Webhook 中间件，在发票核验通过后直接将单据推送到用友/金蝶或钉钉审批流。
