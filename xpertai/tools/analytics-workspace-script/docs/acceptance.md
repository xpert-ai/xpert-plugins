---
title: "历史端到端验收记录"
description: "2026-10-16 原始工作流的实际验收记录；提交审核不代表重跑。"
---

# Workspace 脚本数据源验收

> 以下为此前实现阶段的验收记录。本批提交审核仅重跑本地自动化与打包检查，未重新执行真实模型、Docker 或 SSO 场景。

日期：2026-10-16。环境：本地 Xpert 源码、同步后的 xpert-pro、data-xpert，真实 Docker compute Runtime、PostgreSQL 与已配置的 Tongyi qwen3.6-plus。模型、数据库和 SSO 凭据均沿用授权的本地配置，不进入代码或文档。

## 验收口径

以九行合成订单测试数据为基准，见 [夹具](../examples/orders.csv)。2026 年第三季度只计已支付订单，净销售额为实付减退款，按月份和区域分组。应排除取消订单、六月及十月订单。

| 月份 | 华东 | 华西 |
| --- | ---: | ---: |
| 2026-07 | 1,000 | 800 |
| 2026-08 | 1,500 | 900 |
| 2026-09 | 1,000 | 500 |
| Q3 合计 | 3,500 | 2,200 |

每个请求只给模型业务问题、来源、脚本语言、筛选和刷新要求，不提供 SQL、脚本、Binding、资源 ID 或正确答案。测试在生成后独立核对保存定义、实际数据和来源变更。

## 功能结果

| 场景 | 生成与保存 | 筛选与刷新 |
| --- | --- | --- |
| Python 处理 Workspace CSV | 真实 Agent 读取文件和业务说明、编写脚本、注册并保存看板；6 行，总额 5,700 | 华东 3,500，华西 2,200；文件中七月华东订单增加 100，刷新变为 1,100；恢复后总额 5,700 |
| JavaScript 处理 PostgreSQL | 真实 Agent 通过来源 Binding 在执行中查询订单并保存看板 | 七月华西实付增加 100，刷新由 800 变为 900；恢复后总额 5,700 |
| JavaScript CSV 经 data-xpert SSO 页面 | 在真实 ChatKit 输入一句话，自动编写和注册 JavaScript，生成图表和明细表 | 页面筛选华东为 3 行；修改 CSV 后点击刷新显示 1,100；恢复后重开保存的看板显示原始 6 行 |
| Python 处理 data-xpert 本体来源 | 全新一句话请求自动发现、预览、编写 Python、注册和保存；最终为脚本 Provider，6 行总额 5,700 | 华西 2,200；修改真实本体来源订单，七月华西由 800 变 900，恢复后总额 5,700；同样在 SSO 页面验证筛选和刷新 |

前两个 API 验收及 SSO 生成看板的 API 校验都记录了每次不同的 Analytics executionId 和 Sandbox Job ID。文件/数据库变更均在 finally 中恢复。重启 Pro 后再次查询三个已成功保存的脚本看板，仍各返回 6 行、总额 5,700。

最终本体场景没有人工补写脚本或修改模型参数。Agent 自行修复一次来源预览参数错误，此后脚本注册、预览和保存成功。全部、华东、华西、变更后、恢复后五次查询的 Job ID 和本体 upstreamExecutionId 各不相同；执行 Artifact 的输入链路与返回 Dataset 一致。SSO 页面的真实源变更刷新也通过，截图已逐张查看，来源数据已恢复。

SSO 页面使用真实平台登录和 data-xpert Workbench、原 Live Dashboard View，以及 Data Analytics renderer；没有模拟模型、查询接口或浏览器数据。浏览器证据在本插件忽略的 `output/playwright/` 目录，四组共 20 次查询的本机回执为 `output/acceptance.json`。完整 SSE、Artifact/Job ID 和私有回执不随插件包发布。

## 验收中修复的问题

1. 注册工具原先要求模型拼完整定义 JSON，容易多写括号。现在外层使用结构化参数，来源原生 Binding 保留严格解析的 JSON 文本。模型偶尔把嵌套参数重复 JSON 编码，工具边界允许解码一次，再执行同一严格 schema 校验；领域协议不接受额外字段或权限覆盖。
2. 注册返回的 canonical Binding 被误传给简化的预览工具。新增 `dashboard_preview_binding`，与原工具共用发现、权限和 preview receipt 校验。来源预览也返回完整 bindingJson，供其他适配器直接复用，避免模型重新组装协议。
3. 模型误用不存在的 `node:csv`。插件提供两个语言共用的 `ctx.csv.parse`，明确单文件、标准库及无网络边界。
4. 本体参数路径错误原先被笼统错误遮蔽。注册前预检来源，data-xpert 插件明确返回路径应相对于 params 的错误，平台不加入本体专用逻辑。
5. 模型曾生成数值正确的原生本体看板，却跳过所要求的 Python；该轮不计为脚本验收通过。新增通用 `allowedFinalProviders` 配置，专用脚本验收 Assistant 已发布第 4 版，最终 Binding 必须使用 `workspace_script.query`。普通 Assistant 默认不启用此限制。
6. Python 将 Dataset dict 当作属性对象，错误诊断现明确说明 `source["rows"]` 及上游字段 ID；不回显任意脚本日志或私有输入。
7. Docker 已停止容器返回 304 导致取消清理失败，现作为幂等停止处理。任务 Volume 使用专用受约束的根目录清理入口。
8. 前端增加请求序号，防止晚到响应覆盖后发查询。

失败尝试保留在私有执行历史中。以上结果说明已测试路径的通过情况，不等同于任意业务口径、任意来源或任意模型都能一次生成正确看板。

## 自动化与隔离验证

| 验证 | 结果 |
| --- | --- |
| Core Sandbox Job、invocation、Runtime Definition/selector 定向测试 | 39 通过 |
| Pro Docker Provider 与 selector（包含新增只读 Workspace 策略） | 15 通过 |
| Analytics Runtime 授权、父子取消/期限、来源变更、错误隔离 | 7 通过 |
| SDK 模型参数兼容解析（保留严格字段、类型和限额） | 2 通过 |
| Workspace Script 插件契约、预检、CSV、精度/截断、错误诊断 | 8 通过 |
| data-xpert Provider 参数路径、Actor Token 通道、发现与结果 | 4 通过 |
| Live Dashboard 保存、预览、权限、最终 Provider 策略 | 13 通过 |
| 真实 Docker 网络拒绝和只读输入、无限循环取消、输出软链接拒绝 | 3 场景通过，容器均已回收 |
| 三个改动插件的 dist-first lifecycle、metadata、SDK 构建、Runtime catalog | 通过 |

部分 selector 测试在 Core 与 Pro 重复运行，表格不作为去重总数。没有执行整个多仓库全量测试。跨用户定义拒绝及权限重验入口有定向测试；本次真实 SSO 主要使用一个本地管理员账号，不能作为多角色撤权的完整端到端验收。

## 重跑方式

在 community 工作区执行：

```sh
corepack pnpm --filter @xpert-ai/plugin-analytics-workspace-script test
corepack pnpm --filter @xpert-ai/plugin-analytics-data-xpert test
corepack pnpm --filter @xpert-ai/plugin-live-dashboard test
```

从 xpert-pro 根目录构建真实运行镜像并验证隔离；将变量设为当前插件目录，不使用固定机器路径：

```sh
docker build -f packages/sandbox-runtime/images/compute/Dockerfile \
  -t xpert-sandbox-compute:local .
WORKSPACE_SCRIPT_PLUGIN_ROOT=/absolute/path/to/analytics-workspace-script \
  TS_NODE_PROJECT=apps/api/tsconfig.app.json \
  node -r ts-node/register -r tsconfig-paths/register \
  /absolute/path/to/analytics-workspace-script/tests/docker-isolation.cjs
```

使用平台官方本地部署入口安装插件并按回执重启；发布包含 `LiveDashboard` 和 `WorkspaceScriptDataset` 的测试 Assistant。脚本型 Assistant 可配置 `allowedFinalProviders: ["workspace_script.query"]`。上传夹具至 `acceptance/`，从 SSO 页面发送：

> 请根据 acceptance/orders.csv 和 acceptance/README.md 的业务口径，用 JavaScript 生成并保存2026年第三季度各月各区域净销售额看板，支持区域筛选和读取最新文件的刷新。

检查真实保存记录和行值，再改变一笔测试订单并点击刷新，最后恢复夹具。仅查看 Agent 的“已完成”文本不算通过；最终 Binding 必须是脚本 Provider，刷新必须产生新 Job 和输入版本证据。

## 当前边界

- 实时刷新是打开、筛选及手动刷新重新查询，不包含自动推送、轮询或定时任务。
- 同步查询期限 30 秒；单文件脚本、标准库、UTF-8 输入。文件和结果等限额见 [README](../README.md)。
- 脚本定义归创建用户所有，分享看板不扩大输入权限。注册创建新定义，升级代码可重新注册后更新看板 Binding。
- 自动审计归档/TTL、长任务异步查询、多来源事务快照尚未实现。
- 本地 compute 镜像已验证，生产镜像、不可变 digest catalog 和含新接口的 SDK 仍需正式发布。
