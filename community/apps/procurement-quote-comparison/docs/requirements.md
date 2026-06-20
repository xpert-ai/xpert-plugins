# AI 采购比价助手插件需求文档

## 1. 背景与目标

AI 采购比价助手面向企业采购、行政采购、IT 设备采购和财务共享等场景。用户在 Xpert Project 或采购比价 Xpert 工作台中上传采购需求单，系统自动创建采购比价项目；随后上传多家供应商报价单，由已配置的采购比价 Xpert 调用插件工具完成结构化解析、横向比价、风险识别和推荐说明。

第一版目标是演示 Xpert 的三类能力：

- 大模型读取随解析消息附带的采购需求单和供应商报价单文件，识别结构化业务字段。
- Agent 通过 middleware 工具把解析结果、风险项和推荐结论写入插件业务数据。
- Project 页面通过 view extension 暴露一个可交互工作台，展示列表、详情、解析状态、比价结果和 AI 建议。

## 2. 范围

### 2.1 第一版包含

- 在 Xpert Project 页面 `detail.sections` slot 挂载采购比价工作台。
- 上传采购需求单创建采购项目；保留手动新建动作作为后台 action。
- 在采购项目详情页分入口上传采购需求单和供应商报价单。
- 用户手动触发解析，不做上传后自动解析。
- 同一个采购比价 Xpert 处理需求解析、报价解析和汇总比价。
- 供应商报价批量解析时，每份报价单构造独立提示词，并随消息附带对应文件，不共享其他供应商报价内容。
- 上传文件需要先生成平台文件句柄，解析时按 BOM 的方式把文件引用发送给 Xpert。
- AI 解析字段不覆盖人工字段，冲突记录为待确认字段差异。
- 展示采购需求、供应商报价、横向比价、风险异常、AI 建议和比价说明。

### 2.2 第一版不包含

- ERP、SRM、OA、审批流和真实下单。
- 供应商主数据管理。
- 历史价格分析和预算占用。
- 发票校验、合同法务审查和付款流程。
- 平台 table/detail 低代码拼装复杂页面。

## 3. 用户流程

1. 用户进入某个 Xpert Project。
2. 在 Project 详情页打开「采购比价助手」。
3. 点击「上传采购需求单」，系统根据文件名自动创建采购项目。
4. 进入采购项目详情。
5. 批量上传 2-3 份供应商报价单。
7. 填写或选择已挂载本插件 middleware 的采购比价 Xpert。
8. 点击「解析采购需求」。
9. 点击「批量解析报价单」。
10. 点击「生成比价结果」，由 Xpert 调用工具保存匹配、风险和推荐。
11. 用户查看 AI 建议，必要时追问“为什么不选最低价”。

## 4. 页面结构

### 4.1 采购项目列表

列表展示：

- 项目名称
- 采购编号
- 状态
- 供应商数量
- 风险数量
- 推荐摘要
- 操作

列表支持搜索，并提供「上传采购需求单」入口。

### 4.2 采购项目详情

详情展示：

- 项目基础信息：申请人、部门、预算、期望交期。
- 解析配置：采购比价 Xpert ID、分步解析按钮、一键解析按钮。
- 文件区：采购需求单、供应商报价单。
- 采购需求：采购项、规格、数量、预算、交期。
- 供应商报价：供应商、联系人、含税、交期、付款条款、质保、报价明细。
- 横向比价：按采购项比较供应商报价。
- 风险异常：规格不一致、数量不一致、报价缺失、交期风险、质保风险、价格异常。
- AI 建议：推荐供应商、推荐理由、比价说明、待确认问题。

## 5. 核心数据对象

业务隔离以「采购比价项目」为边界，同时按 tenant、organization、workspace/project 过滤。

采购比价项目不是 Xpert Project 本身，而是插件内的业务 case。Xpert Project 只是页面宿主和工作空间边界。

核心对象：

- `ProcurementComparisonCase`：采购比价项目。
- `ProcurementSourceDocument`：来源文件。
- `ProcurementParseJob`：解析任务。
- `ProcurementRequirementItem`：采购需求项。
- `ProcurementSupplierQuote`：供应商报价单。
- `ProcurementQuoteItem`：报价明细。
- `ProcurementItemMatch`：商品匹配结果。
- `ProcurementRiskItem`：风险项。
- `ProcurementRecommendation`：推荐结果。

## 6. Agent 与插件分工

### 6.1 Agent/Xpert 负责

- 阅读解析消息附带的采购需求单和供应商报价单文件。
- 从非固定模板的文件内容中抽取结构化字段。
- 判断商品名称、型号、规格是否可匹配。
- 识别价格、交期、质保、付款条款和技术偏差。
- 生成推荐结论和自然语言说明。
- 回答用户追问，例如为什么不选最低价。

### 6.2 插件负责

- 定义业务数据模型和租户、组织、Project 隔离边界。
- 提供 Project 页面的 view extension 工作台入口。
- 提供 remote component UI。
- 上传文件后登记平台文件句柄，保证解析消息可以附带原文件。
- 解析按钮构造带 caseId、documentId、parseJobId 和文件引用的提示词，并通过 `assistant.chat.send_message` 发送给当前 Xpert。
- 暴露 middleware tools，供 Agent 保存结构化结果。
- 保存解析失败状态，支持重新解析。
- 在人工字段和 AI 字段冲突时保留人工字段并记录差异。

## 7. Middleware 工具

当前 middleware 暴露以下工具：

- `procurement_save_requirement`
- `procurement_save_supplier_quote`
- `procurement_save_item_matches`
- `procurement_save_risk_items`
- `procurement_finalize_recommendation`
- `procurement_report_parse_failure`

## 8. View Actions

当前 view provider 暴露以下动作：

- `create_comparison_case`
- `create_case_from_requirement_file`
- `upload_requirement_file`
- `upload_supplier_quote_file`
- `start_requirement_parse`
- `start_supplier_quote_parse_batch`
- `one_click_parse_all`
- `generate_comparison_result`
- `update_manual_fields`

## 9. 演示脚本

演示准备：

- 一个 Xpert Project。
- 一个已挂载采购比价 middleware 的 Xpert。
- 一份采购需求单。
- 三份供应商报价单。

演示链路：

1. 上传采购需求单创建采购项目。
2. 进入详情并上传三份报价单。
3. 手动解析采购需求。
4. 批量解析三份报价单。
5. 生成横向比价。
6. 查看风险异常。
7. 查看推荐供应商和推荐理由。
8. 追问“为什么不选最低价”。

## 10. 验收要点

- Project 详情页能看到采购比价助手入口。
- 上传采购需求单后能创建采购项目并进入详情。
- 上传与解析是分步动作。
- 报价单解析提示词互相独立，每条消息只附带一家供应商文件。
- 文件上传后能保存平台文件句柄；没有文件句柄时解析按钮应给出明确错误提示。
- 没有配置采购比价 Xpert 时页面有明确提示。
- AI 补充字段不覆盖人工字段。
- 解析失败状态可保存并用于重新解析。
- 工作台能展示列表、详情、文件、解析结果、风险和建议。
