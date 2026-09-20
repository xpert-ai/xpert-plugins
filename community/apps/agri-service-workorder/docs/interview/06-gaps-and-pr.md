# 交付缺口与任务书对照

依据《Xpert 业务应用开发面试说明》。

| 任务书要求 | 材料 | 结论 |
| --- | --- | --- |
| 明确用户、痛点、流程、页面、AI 作用与取舍 | [01-product.md](01-product.md) | 已提供 |
| 独立插件源码、依赖、测试 | `community/apps/agri-service-workorder` | 已随 PR 提交 |
| 环境、构建、安装、配置、使用 | [02-runbook.md](02-runbook.md) | 已提供 |
| README 内真实运行截图（输入/结果/异常） | 插件 [README](../../README.md) | 已提供 2 张：待确认生成 + 待补充 |
| 验证结果与未验证项 | [03-validation.md](03-validation.md) | 已提供 |
| AI 协作说明 | [04-ai-collaboration.md](04-ai-collaboration.md) | 已提供 |
| 基线 SHA、复用与 Git | [05-sources.md](05-sources.md) | 已提供 |
| 已知限制 | 本文 | 已提供 |
| PR → 上游 main | [#681](https://github.com/xpert-ai/xpert-plugins/pull/681) | 已创建 |
| 一次真实 AI | 截图 1 | 已满足 |
| 结果可查看/恢复 | 对话历史 + DB 工单 | 已满足 |
| 失败重试 | 待补充后可继续补全 | 已满足（对话路径） |
| 工作台人工点选保存 | — | **未完全验收**（Chat 宿主视图曾 404） |

## 已知限制

1. Chat 宿主下固定工作台 `agri_service__workbench` 曾出现 View 404；虽已放宽 activation，本 PR 不以工作台点选保存作为必过项。  
2. 未对接真实派工/ERP；主数据导入为演示级。  
3. 字段物理列名沿用通用工单命名，农服语义由提示词与 UI 承载。  
4. 未提交 plugin-dev-harness 正式跑通报告。  

## 面试演示建议顺序

安装插件 → 初始化 → 创建并发布「农服工单助手」→ 完整需求生成待确认工单 → 不完整需求生成待补充 → 打开 README 截图与本目录文档说明取舍。
