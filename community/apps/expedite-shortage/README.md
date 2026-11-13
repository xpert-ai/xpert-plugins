# 提前交货缺料分析（Expedite Shortage Analysis）

> 开发中。完整的产品说明、运行说明、截图和验证结果会在提交 PR 前补齐。

一个运行在 Xpert 上的业务插件：计划员录入客户的提前交货请求，助手调用工具展开 BOM、查询库存与在途、找替代料，
给出逐个缺料物料的建议；缺料数字由服务端计算，计划员在工作台逐条采纳/驳回后确认结论。

- 包名：`@xpert-ai/plugin-expedite-shortage`
- 插件级别：`tenant`，产物命名空间：`expedite_shortage`（表名前缀 `plugin_expedite_shortage_`）

## 本地命令

```bash
corepack pnpm --filter @xpert-ai/plugin-expedite-shortage build
corepack pnpm --filter @xpert-ai/plugin-expedite-shortage test
```
