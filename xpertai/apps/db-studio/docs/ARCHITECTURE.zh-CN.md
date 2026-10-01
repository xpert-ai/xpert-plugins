# DB Studio 架构说明

DB Studio 是一个 system 级 Xpert 插件。宿主负责凭据解析、连接授权和独立物理连接；插件只接收安全连接摘要，并通过 `platform.datasource.workbench` 创建工作台适配器。Remote View 与 Agent middleware 共用 `StudioService`，因此人工界面和 Agent 使用相同的查询、计划、审批、执行和回执边界。

数据记录以 `tenantId`、`organizationId`、`workspaceId`、`userId` 复合范围隔离。查询结果保存 24 小时并在读取和导出时检查期限。写入先冻结 SQL、目标、参数、策略版本和规范 JSON 摘要；审批或预授权失效后不能执行。执行失联返回 `unknown`，系统不会自动重放。取消通过关闭本次独立物理连接完成，不发送会话终止 SQL。

Doris 使用 MySQL 协议兼容驱动，但版本能力按 `@@version_comment` 判断；无法确认真实版本时关闭写入和导入。Doris Stream Load 使用稳定 operation label、大小限制、过滤行回执和重定向主机白名单。MySQL 与 PostgreSQL 的手动事务绑定到同一物理连接，并受时限、并发数和策略版本约束。

工作台布局和交互参考 LibreDB Studio 0.16.0（提交 `9a66cd9ada53c05eb759f58aefce194ea833bb35`）。本插件没有运行时引用 LibreDB 源码；仅借鉴其工作区、结果网格、图表、透视和关系浏览的交互思路。LibreDB 以 MIT License 发布，版权归 LibreDB 项目及其贡献者所有。

当前实现保留明确的能力上限：结果分页最多 1,000 行、导入受大小和列校验约束、ER 图最多读取当前页 50 个对象、快照最多 1,000 个对象。跨进程事务亲和性、重启恢复和真实 Doris 连接仍需在目标平台完成验收后才可视为可用。
