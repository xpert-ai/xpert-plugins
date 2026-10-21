---
title: "HTML 模式历史验收"
---

> 历史验收记录：本次分批提交审核未重新执行其中的模型、SSO、部署或源数据变更场景；当前本地检查见 [构建与验证](verification)。

# HTML / JavaScript 自由看板：实现与验收

日期：2026-10-16。结果：本地 xpert-pro + data-xpert SSO 环境通过本次验收。

## 实现边界

| 归属 | 实现 | 作用 |
| --- | --- | --- |
| xpert 平台 SDK（同步至 xpert-pro） | `artifact-document` 子入口：protocol / runtime / host | 通用 HTML 隔离宿主、CSP、独立 MessageChannel、严格查询协议、Binding 白名单、请求限额、最新响应优先、刷新及类型保持的 select 绑定 |
| Live Dashboard 插件 | schema / service / middleware / remote view | 可选 HTML presentation、Agent 写文件/保存工具、版本绑定查询、数据与页面原子保存、模式选择 |
| Live Dashboard 插件 | html-validation + Sandbox Action | 用真实预览 Dataset 执行页面，失败时返回可修复诊断；通过后才创建 Artifact |
| 平台现有能力 | Analytics Runtime、Dataset/Binding、WorkspaceFiles、Artifacts、Managed Queue、Sandbox Jobs | 权限、数据源适配、文件访问、版本与 CAS、后台执行及资源隔离 |
| 现有插件 | data-xpert Provider、PostgreSQL、Workspace Script Provider、Data Analytics renderer | 继续独立、可替换，不进入 HTML 宿主实现 |

HTML 页只调用 `query(bindingId, controls)`；Artifact/版本由宿主闭包提供，Provider、原生查询和凭据由后端保存的 Binding 解析。HTML、Controls、Bindings 位于同一内容哈希版本。页面不能指定替代数据源或查询体。

## 一句话真实生成

通过 data-xpert 的 SSO ChatKit 入口，使用测试助理 `live-dashboard-acceptance`、已授权本地模型 `qwen3.6-plus`，输入一条消息：

> 请基于 data-xpert 验收数据源的本体净销售额，生成并保存两份2026年第三季度按月份和区域分析的 HTML/JavaScript 实时看板：一份是深色经营驾驶舱，另一份是浅色杂志式分析页面；两份使用同一数据口径，都要有区域筛选、图表、明细和实时刷新。

执行 ID：`53385433-ac36-4793-b1cd-cc0b86dbe30c`，状态 `success`，只有 1 条 human 消息。该助理仅启用 Live Dashboard middleware。Agent 自行发现本体、修正一次预览参数错误、取得真实 Dataset、编写并修正 HTML，然后保存两份看板；没有人工补写这两份页面。

| 页面 | Artifact ID | Version ID | 预检 Sandbox Job |
| --- | --- | --- | --- |
| 2026年Q3 本体净销售额 · 经营驾驶舱 | `dd53f0f7-2e5e-45a7-80d8-943c52dc0e16` | `a6352d3d-05e9-4c80-ab82-a1ddeac65e23` | `bfbadff5-ac26-4669-9d75-f9db49ab22f8` |
| 2026年Q3 本体净销售额 · 杂志式分析 | `d68d2a80-2031-4cdd-a002-5e3b6614de9f` | `56a428a5-c9fc-4280-b978-5a1a9f8217ff` | `d230c6c8-94a3-4a2f-bc20-958b92466cbe` |

两个版本均为 v1，HTML 不同，Binding 完全一致：`netsales_q3_2026`，Provider 为 `data-xpert.ontology`，来源为 NetSales 本体。两个 Browser Job 均 `succeeded`，容器均已回收。版本 metadata 保留 `htmlValidation.status=passed` 和 Job ID。

## 业务与浏览器验收

数据口径：2026 年 7–9 月，已支付订单扣除退款，人民币元；粒度为月份 × 区域。

| 检查 | 真实结果 |
| --- | --- |
| 两种样式 | 深色驾驶舱使用 KPI 卡片、分组柱图、环形图；浅色杂志页使用导语、衬线标题、折线图、结构图及明细。均经截图检查 |
| 全部区域 | 6 行，合计 5,700；月度合计 1,800 / 2,400 / 1,500 |
| 华东筛选 | API 核对 3 行，合计 3,500 |
| 华西筛选 | 两份真实页面均为 3 行、2,200，图表/KPI/明细同步，筛选候选项仍保留全部区域/华东/华西 |
| 实时刷新 | 将验收源表 `dashboard_sales_orders_acceptance` 的 `ld-02` 金额增加 100；两份页面保持华西筛选，点击宿主刷新后变为 2,300，7 月变为 900 |
| 状态保留 | 刷新前后选项不变；页面中设置的验证标记仍在，证明刷新没有重载整个 HTML 文档 |
| 恢复 | 每次变更均在 finally 中恢复；两份页面回到 2,200，最终全量查询回到 5,700 |
| 保存重开 | 重启 xpert-pro API、重新加载 data-xpert，再从选择器打开两份页面；原 Artifact/Version 不变，重新查询得到 6 行、5,700 |
| 标准模式兼容 | 既有“2026年第三季度净销售额看板（人民币元）”仍由 Data Analytics 渲染，柱图及 6 行明细正确 |

HTTP 验收对每份页面执行全量/华东/华西及重复刷新，共 12 次成功查询；每次重新执行得到不同 executionId。保存重开同时核对定义完全一致。

截图（本地验收输出，不含凭据）：

- [深色页](../output/playwright/html-dark-all.png)
- [浅色页](../output/playwright/html-light-all.png)
- [深色页实时刷新](../output/playwright/html-dark-live-refresh.png)
- [浅色页实时刷新](../output/playwright/html-light-live-refresh.png)
- [Data Analytics 回归](../output/playwright/html-standard-renderer-regression.png)

## 声明式查询边界

真实 SSO 页面中尝试未知 Binding、修改 `ready()` 返回的客户端白名单后再查询、伪造父窗口 View Action 消息、读取父页面 DOM/Storage、直接 fetch 后端接口。全部被拒绝，越权尝试产生的 `query-binding` 后端请求为 0。

另外通过已认证 HTTP 客户端，对每份页面分别注入 `payload.sql`、`providerId`、完整 `binding`、替代 `dataSourceId`、未知 Binding、未知 control：共 12 次拒绝，前四种及未知 control 为 400，未知 Binding 为 403。服务端从已保存版本取 Binding，不信任页面提供的查询体。

平台真实 Chromium 测试还覆盖原始 MessagePort 请求注入、旧响应覆盖、资源加载、自导航、eval 和网络阻断；单元测试覆盖其他用户/组织/host、文件篡改和来源权限撤销。该边界针对受隔离的生成页面，不改变已认证用户通过平台其他授权接口访问数据的能力。

## 验收中发现并修复的问题

前两轮生成分别暴露了“筛选选项未初始化”和“查询了未保存的辅助 Binding”；它们不计入通过结果。新增通用 `bindSelect`，强化单一完整 Dataset 指导，并增加保存前隔离浏览器预检。用真实后台任务重放缺失 Binding 页面，返回 `DASHBOARD_HTML_PREFLIGHT_FAILED`，没有创建 Artifact。另有 Chromium 回归用例确认渲染回调异常也会阻止保存。

四份失败实验 Artifact 已归档，保留调查记录；最终两个通过版本仍可在实时看板中选择。

## 验证命令与范围

- 插件构建及 19 项测试通过；平台协议 3 项测试通过。
- 平台浏览器边界测试 13 个场景通过；预检浏览器回归 3 个场景通过。
- `verify:dist`、插件 lifecycle harness、真实 npm tarball Action 文件树哈希验证通过。
- 实际插件 `loadStatus=loaded`；平台健康检查无异常；xpert / xpert-pro 通用文档宿主源码一致。
- 可复用脚本：`tests/verify-installed-html.mjs`（外部私有上下文 + Keychain 登录）、`tests/html-preflight-browser.mjs`、平台 `packages/plugin-sdk/tests/artifact-document-browser.cjs`。

本轮证明一条业务需求生成两份可用页面，以及上述具体交互和边界。预检只覆盖初始执行，不证明任意业务定义、延迟分支和所有 UI 交互都正确。当前刷新是按当前筛选重新查询最新来源，不含自动推送。HTML 保存需要可用 Browser Runtime；此次为本地构建和部署，尚未发布 SDK/插件 npm 包。更多协议与能力边界见 [HTML 模式说明](html-mode.md)。
