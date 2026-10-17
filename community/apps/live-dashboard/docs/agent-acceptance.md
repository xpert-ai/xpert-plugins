---
title: "一句话生成历史验收"
---

> 历史验收记录：本次分批提交审核未重新执行其中的模型、SSO、部署或源数据变更场景；当前本地检查见 [构建与验证](verification)。

# 一句话生成业务看板：实现与独立验收

日期：2026-10-16。本文补充 [MVP 验收](acceptance.md)，重点验证真实模型与真实聊天入口；不把手写 Binding 的接口测试当成 Agent 验收。

## 验收方式

在 xpert-pro 使用获授权复用的本地 Tongyi `qwen3.6-plus` 模型，通过 xpert-pro ChatKit 和 data-xpert SSO 内嵌 ChatKit 提交业务需求。提示中没有 SQL、字段名、资源 ID、看板 JSON 或预期金额。专用测试 Assistant 的 `LiveDashboard` middleware 为必需节点；模型和数据源凭据保留在平台及本地密钥设施中。

业务需求是：生成并保存 2026 年第三季度净销售额看板，按月份和区域展示，支持区域筛选，金额以人民币元展示。两次分别指定 PostgreSQL、data-xpert 来源。

测试数据包含 9 个订单：6 个季度内已支付订单，以及取消订单、季度前订单和季度后订单。表注释与语义模型明确：净销售额仅包含已支付订单，计算已支付金额减退款；按订单日期归属月份。data-xpert 同时绑定多个模型，Agent 必须发现并选择正确指标。

独立期望值（不提供给模型）：

| 月份 | 华东 | 华西 | 合计 |
|---|---:|---:|---:|
| 2026-07 | 1,000 | 800 | 1,800 |
| 2026-08 | 1,500 | 900 | 2,400 |
| 2026-09 | 1,000 | 500 | 1,500 |
| Q3 | 3,500 | 2,200 | 5,700 |

真实查询与保存、全部/华东/华西筛选、重新打开及刷新均按这些期望值校验。每次刷新要求新的平台 executionId；data-xpert 还要求新的上游 Action executionId。金额字符串保留精度，只有渲染副本转换为安全数值。

## 最终结果

| 场景 | 结果 | 保存回执 |
|---|---|---|
| xpert-pro ChatKit → PostgreSQL | 一句话生成、自动打开正确看板、筛选、刷新通过 | Artifact `e24cc376-6fcc-4a6f-9b62-2d1a8f72e482`，版本 `e939d81c-4599-4618-a73f-cd7f5bb44803` |
| data-xpert SSO ChatKit → 本体 Action | 一句话生成、自动打开正确看板、筛选、刷新通过 | Artifact `9aa56192-2498-44a7-8116-d908c427bf56`，版本 `9451ee7f-db38-44fb-99b1-a595c1203838` |
| 无足够事实的客户终身价值请求 | 复测未保存替代看板，要求补充口径或数据 | 无保存回执 |

两张最终看板分别为“2026年第三季度销售复盘 - 各月各区域净销售额（人民币元）”和“本体销售复盘”。两边真实 UI 均选择/输入“华西”，点击应用筛选后只显示 800、900、500 元，再点击刷新确认结果与查询时间更新。独立脚本对每张最终看板的全部/华东/华西三个场景各执行两次，6 个场景全部通过。

本机截图（保存在忽略目录，未提交）：[PostgreSQL 筛选与刷新](../output/playwright/agent-postgres-filtered.png)、[data-xpert 筛选与刷新](../output/playwright/agent-datax-filtered.png)。前期未通过粒度或筛选验收的两张测试 Artifact 已归档；看板列表只展示 active Artifact，避免把失败试验当成可用结果。

最终 API 重启、两个页面重新加载后，从持久化列表选择各自看板，均恢复默认全区域的 6 条准确数据，随后独立脚本再次通过全部 6 个筛选场景。[PostgreSQL 重新打开](../output/playwright/agent-postgres-reopened.png)、[data-xpert 重新打开](../output/playwright/agent-datax-reopened.png)。

## 本轮完善的模块

| 所属 | 修改模块 | 职责 |
|---|---|---|
| Xpert 平台 / SDK | `analytics-query.model.ts`、`plugin-sdk/src/lib/data/analytics`、`server/src/data-source/analytics` | 通用分页发现协议、Provider 发现接口、鉴权、查询分发、Dataset 校验、可修复的安全错误码 |
| Xpert 平台 / SDK | Workbench adapter / SQL guard | 传递数据库业务注释；支持只读 `DATE_TRUNC` |
| Xpert 平台 | queued Agent 的 runtime user 恢复 | 重新读取当前用户及组织权限；不信任序列化旧角色，不以 Assistant 创建者替代当前用户 |
| Xpert 平台 | `xpert-agent/agent.ts` 工具完成事件 | 完成消息携带工具名称，使宿主可独立路由结果；不依赖聊天文本合并之前的开始消息 |
| PostgreSQL 插件 | `analytics-postgres/discovery.ts`、原生 `postgres-workbench.ts` | 目录/字段/注释/键发现；SQLSTATE 错误及时返回，避免等待查询超时 |
| data-xpert | analytics discovery/query、semantic model mapper | 当前用户可见资源与 Action 发现；发布时保留指标描述、源列、格式与业务语义；只读 Action 实时执行 |
| data-xpert 适配插件 | `analytics-data-xpert/provider.ts` | 本体 Action 原生查询契约、参数路径、SSO actor token、统一 Dataset；单值筛选与数组条件的语义由插件说明 |
| Live Dashboard 插件 | middleware / agent schema | 发现 → 预览 → 保存；本次执行的预览回执、工具调用预算、业务口径与缺失信息澄清 |
| Live Dashboard 插件 | dashboard schema / service | 图表粒度、控件默认值和类型校验；保存前探测声明的非默认筛选；复用 Artifacts 版本与 CAS |
| Live Dashboard 插件 | remote bridge / view | 仅从成功保存回执打开精确 Artifact；忽略开始/失败日志并去重；复用原 Data Analytics 渲染器 |

通用协议与权限逻辑同步到 xpert-pro；未把 PostgreSQL SQL、data-xpert 本体语法或看板提示词塞入平台。LLM 边界的 `requestJson`/`payloadJson` 只是函数调用格式适配，解析后仍使用统一 JSON Binding 协议。

## 验收发现及修复

1. ChatKit 使用显式插件允许列表，原可选 middleware 没有被加载。专用看板 Assistant 将其标记为 `required: true`；没有绕过平台能力选择规则。
2. 同一“月份×区域”数据集曾被用于未编码区域的折线图。新增粒度校验后，合计趋势必须另查月度聚合 Dataset，或保留区域系列。
3. data-xpert 曾用数组 `in` 条件绑定单值筛选，默认 null 可用但区域选择失败。补充原生契约说明，并在预览/保存时探测声明的非默认值；真实验收另外逐一验证全部、华东、华西。
4. 扁平 Artifact 回执被宿主自动作为 JSON 文件打开。改为 `{ dashboard: savedReceipt }`，由插件视图负责展示，Artifacts 继续负责持久化。
5. 宿主通道含有工具开始日志，而平台原完成消息没有工具名，无法被订阅器识别。平台补全完成事件身份；视图不再根据“最新看板”猜测结果，而是验证成功回执，使用其中的 Artifact ID 精确打开。
6. 负向案例“客户终身价值”最初试图用区域收入替代。加强业务约束后复测：发现销售订单缺客户标识、可关联支付表为空，未调用保存，向用户请求业务澄清。此项不等价于对任意模型和任意指标的正确性保证。

## 自动化回归与复现

- Dashboard：11 项测试通过，涵盖预览回执、权限重新校验、图表粒度、默认与非默认筛选、保存 CAS、文件摘要、防止打开错误看板。
- PostgreSQL provider：3 项单测通过；真实 PostgreSQL 集成另行显式启用并通过，包含参数绑定、截断、只读拒绝、错误后继续查询、SQLSTATE 在 3 秒内返回。
- data-xpert provider：4 项测试通过。
- 平台 analytics HTTP：5 项；SDK 结果规范化 9 项、字段注释 1 项、SQL guard 41 项；运行用户及分发相关 20 项通过。
- 平台 Agent 流事件：8 项通过，包含工具完成消息携带工具名与结果的回归断言。
- data-xpert discovery/query/语义映射：19 项通过；两份关联技能文档校验通过。
- 三个新增插件及原生 PostgreSQL 插件的 dist-first 生命周期验证通过；最终插件元数据来自各自 package.json，静态元数据检查通过。
- contracts/SDK 构建、插件构建及远程组件类型检查通过；核心变更在 xpert / xpert-pro 的对应文件校验一致。

保存后可使用 `tests/verify-installed-dashboard.mjs` 独立复核。其私有 context 包含 API 地址、Assistant/Artifact/version ID、Keychain 条目名称、各筛选场景及独立期望行；不包含密码或 token。脚本读取持久化定义，重新执行所有场景并比较精确行集，最后再次刷新检查执行记录。

```sh
node tests/verify-installed-dashboard.mjs \
  --platform-root /path/to/xpert-pro \
  --context /private/oracle-context.json \
  --output /private/verification.json
```

## 边界

“正确”以本次固定业务口径与独立数据 oracle 为准。真实业务需要可发现的指标定义、日期归属、单位、状态过滤与关联基数；缺失时应澄清。结构校验不能推导缺失的业务事实。模型仍可能出现可修复的参数错误，耗时与重试次数随模型变化。

保存前的筛选探测使用声明的候选值，不会编造自由输入控件的业务值，也不穷举多个筛选器的笛卡尔积。开放输入与复杂组合需要业务场景验收。

本轮没有新增跨源 Join、公开分享、调度刷新或 Workspace Python/JavaScript 执行器；后者继续保留为独立可替换 Provider 方案，见平台 `workspace-dataset-pipelines.md`。
