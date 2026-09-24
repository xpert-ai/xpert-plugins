# 产品与数据设计

## 用户和问题

目标用户是收到大量微信、电话或会议需求的销售、售前与项目经理。他们需要保留客户原话，又要迅速判断需求方向、信息缺口和下一步。应用把模型定位为“判断助手”，最终决定始终由业务人员保存。

## 关键流程

1. 用户输入客户名称、需求标题和至少 10 个字符的沟通原文。
2. 服务端保存草稿，生成客户端幂等键，刷新或重试不会产生重复记录。
3. Jev 对同一原文并行执行两个 Choice、一个 Score 和四个 Noul 判断。
4. 代码根据紧迫性及暂缓规则生成初始优先级，低置信度标记为需要重点复核。
5. 用户对照原文修改模型建议并保存跟进决定。
6. 修改原文时清空旧评估与决定，要求重新评估。

## 状态机

`draft → evaluating → review → confirmed`

模型或网络失败进入 `failed`，保留原文并允许回到 `evaluating`。评估租约超过两分钟会把遗留的 running attempt 记为 `interrupted`，然后允许重试。完成评估时再次校验预留版本，避免旧请求覆盖新内容。

## 数据模型

`DemandEntity` 使用 `pluginArtifactTableName('customer_demand', 'record')`，主要字段包括：

- 范围：`tenantId`、`organizationId`、`createdById`；
- 幂等与并发：`requestId`、`revision`、`leaseUntil`；
- 客户输入：`customer`、`title`、`source`；
- 推断与人工结果：`assessment`、`decision`；
- 可观测性：`attempts`、`errorCode`、创建和更新时间。

`assessment` 保存模型建议、各候选概率、信息完整度概率、实际模型名和 token 统计；`decision` 保存人工确认后的类型、优先级、下一步、备注、确认人和时间。两者分开，人工修改不会篡改模型原始结果。

## 信任边界

- 密钥只在服务端 `JevEvaluator` 和本地验证脚本中读取。
- Remote View 只通过 Xpert bridge 请求数据和动作，不使用 localStorage/sessionStorage，也不直接访问 TypeSafe。
- tenant、organization、user 来自可信请求上下文，不接受模型或前端传入的范围字段。
- Assistant 工具没有 confirm；人工确认只能在有权限的工作台中完成。
- 服务返回稳定错误码，页面不会显示 SDK 异常、请求体或凭据。
