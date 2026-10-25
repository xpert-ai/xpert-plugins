# 开源 NsJail 自动看板本地验收

日期：2026-10-22。使用开源 `xpert` 源码 API、Linux NsJail Runner、Workspace Script 与 Live Dashboard 插件，以及本地已有的真实 Tongyi `qwen3.6-plus` 配置。Compute 作业全部由 `nsjail-compute` 执行，绑定为 `nsjail-compute:node-python-v1`，Runtime Suite 为 `1.3.0`。运行链路不依赖 Pro API 或 Pro Docker Runtime Provider。

本次验证 Python 读取合成订单 CSV、注册脚本数据集、创建标准图表和明细表、保存看板草稿，以及浏览器中的筛选和刷新。输入是 [九行订单夹具](../examples/orders.csv)。仅提供业务口径、源文件位置和交互要求，由模型通过工具编写、修正脚本并保存看板；未手工替模型写脚本、Binding 或查询结果。账户、实例标识、执行历史和截图保存在本地私有验收目录。

## 最终结果

同一看板最终保存为草稿 r4。最终模型执行记录为 `success`，实际执行模型为 `qwen3.6-plus`；保存定义的最终 Provider 为 `workspace_script.query`。看板包含按月趋势折线图、区域对比柱状图、明细表以及区域筛选。

浏览器通过正常登录进入助手，从实际聊天输入框提交请求，再通过资源卡打开看板。逐项核对真实查询响应、页面表格行值和两个已渲染图表：

| 检查点 | 行数 | 净销售额合计（元） |
| --- | ---: | ---: |
| 初次打开并刷新，全部 | 6 | 5,700 |
| 华东筛选 | 3 | 3,500 |
| 华西筛选 | 3 | 2,200 |
| 恢复全部筛选 | 6 | 5,700 |
| 增加同月同区域订单，点击刷新 | 6 | 5,800 |
| 更新后的华东筛选 | 3 | 3,600 |
| 更新后的华西筛选 | 3 | 2,200 |
| 恢复原始 CSV，再查询全部 | 6 | 5,700 |
| 重载页面并刷新 | 6 | 5,700 |

新增测试订单为 `2026-07-15 / 华东 / paid / 实付 150 / 退款 50`，用于检查同月同区域多笔订单的实际累加。九个检查点均产生新的 Compute Job；没有用固定快照替代刷新。测试最终按字节比对并恢复原始 CSV，保存定义仍是同一个 Artifact 的 r4 草稿，未发布看板正式版本。

## 失败与修复记录

本轮并非一次生成成功，失败记录未删除：

1. 首次模型使用 `pandas`，不符合仅标准库的 Compute 契约。Action 将脚本非零退出误归类为 `SANDBOX_START_FAILED`，经 Analytics 转译成运行时不可用，掩盖了脚本问题。本次修复 Action 的错误分类为已有的 `EXPORT_INPUT_INVALID`，插件保留该类型，开源与 Pro 的 Analytics 边界返回平台固定提示。原始日志、路径、作业标识仍不会作为公开诊断返回。原失败脚本在真实 NsJail 中复测，返回 HTTP 400、`EXPORT_INPUT_INVALID`、`retryable: false` 和标准库/入口契约提示。
2. 测试助手误设 `skillsMiddleware.resourceOnly`，屏蔽了模板安装到 Workspace 的技能。修正本次测试助手配置后，模型成功读取两个技能及运行时参考。未修改其他助手。
3. 本地数据库缺少 Analytics Definition 表。应用仓库已有的 `20261021090000-analytics-definitions.sql`，确认迁移前两表不存在，迁移后检查通过；未开启全库 schema 同步或删除已有数据。
4. 模型曾偏离标准图表要求、产生无效工具调用、筛选默认值不一致以及未编码完整粒度的图表。工具校验拒绝无效保存，后续由模型修正。重复工具调用也曾触发模型服务的防循环限制，这些轮次不算成功。
5. 初版脚本逐订单输出，在原始九行数据上表现正常；加入同月同区域订单后，真实页面刷新返回 `ANALYTICS_GRAIN_MISMATCH`。恢复输入文件后，开启新的修复对话，让模型用 `Decimal` 按月份和区域累加，重新注册并更新原看板。最终 r4 通过上述九项页面验证。

## 自动化检查

| 检查 | 结果 |
| --- | --- |
| Workspace Script 插件测试 | 37 通过 |
| Live Dashboard 插件测试 | 109 通过 |
| 开源 Analytics Runtime 定向测试 | 25 通过 |
| Pro Analytics Runtime 定向测试 | 25 通过 |
| 两个插件的 dist-first 生命周期加载 | 通过 |
| Workspace Script 打包资产与元数据检查 | 通过 |
| 真实浏览器筛选、源文件变化、恢复及重载 | 9 个检查点通过 |

定向测试使用：

```sh
# xpert-plugins/xpertai
corepack pnpm exec nx test @xpert-ai/plugin-analytics-workspace-script
corepack pnpm exec nx test @xpert-ai/plugin-live-dashboard

# 分别在 xpert、xpert-pro 根目录
corepack pnpm exec nx test server --runInBand \
  --testFile=packages/server/src/analytics/analytics-runtime.spec.ts
```

使用 `--testFile` 限定文件。一次旧参数 `--testPathPattern` 触发的广泛测试已停止，不计入通过结果；本次不声称全仓测试通过。

Sandbox Job 持久化记录验证了实际 Provider、绑定、成功状态和清理时间。所有本轮脚本定义关联作业（含失败尝试）均完成清理，Runner 的 `/run/xpert-compute` 没有残留作业目录。当前结论限于本地已配置模型、合成 CSV 和标准看板的验收路径，不能作为任意模型一次生成成功的保证。
