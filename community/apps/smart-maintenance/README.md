# Smart Maintenance Plugin

Smart Maintenance 是一个用于 AI 辅助维保报修受理的 Xpert 业务工作台插件。

它遵循 BOM document-intake 插件架构：

- Agent middleware 暴露面向业务动作的维保工具。
- View provider 暴露报修入口和工单审核台两个 Workbench 视图。
- Remote component 渲染 iframe UI。
- Service 层负责状态流转、相似工单查询和操作日志。

第一版范围刻意收敛在 Xpert 侧演示闭环内，不实现真实 CMMS/FSM/ERP 集成、派工、库存、报修人门户、通知、附件或 SLA。

## Agent middleware tools

- `smart_maintenance_save_generated_work_order`：从自然语言报修保存一张待确认工单。
- `smart_maintenance_get_catalog`：返回设备、故障、位置、部门、岗位、备件等候选数据。
- `smart_maintenance_search_work_orders`：按状态、关键词、设备类型和紧急程度查询工单摘要。
- `smart_maintenance_get_work_order_detail`：查询单张工单详情和操作日志。
- `smart_maintenance_prepare_supplement_draft`：根据用户补充内容保存 AI 补充草稿，供审核台一键填入。

确认处理、标记已处理、驳回关闭只保留为 Workbench view actions，不暴露给 Agent tool。

## 数据存放

业务数据存插件自己的 TypeORM 表：

- `smart_maintenance_work_order`：工单主数据、AI 推荐、人工确认、处理状态和 AI 补充草稿。
- `smart_maintenance_work_order_log`：AI 生成、人工修改、补充草稿、补充保存、确认处理、处理完成和驳回关闭日志。

mock catalog 第一版保存在 `SmartMaintenanceMockCatalogService`，暂不建设正式主数据表。

## 平台 Agent 提示词建议

```text
你是智能维保受理与审核助手，负责把用户的自然语言报修转成可复核的维保工单，并辅助查询、解释和补充工单。

当用户明确描述设备故障、报修、巡检异常或售后问题时，先提取结构化字段，再调用 smart_maintenance_save_generated_work_order 保存一张待确认工单。不要把一次报修拆成多张工单；如果包含多个设备或多个故障，设置 hasMultipleIssues 和 multipleIssueTip。

字段不完整时不要编造设备编号、联系人、发生时间或位置；把缺失项写入 completenessTips。AI 诊断只能作为初步判断，必须保留“需现场复核”的语气。

需要规范候选项时调用 smart_maintenance_get_catalog。用户查询工单列表时调用 smart_maintenance_search_work_orders；查看某张工单时调用 smart_maintenance_get_work_order_detail；用户补充待补充工单信息时调用 smart_maintenance_prepare_supplement_draft，并提醒用户到维保审核台一键填入后人工保存。

不要承诺已经派工、已经修复或已经关闭。确认处理、标记已处理、驳回关闭必须由人工在维保审核台完成。
```
