# 交付缺口与任务书对照

依据《Xpert 业务应用开发面试说明》。

| 任务书要求 | 材料 | 结论 |
| --- | --- | --- |
| 明确用户、痛点、流程、页面、AI 作用与取舍 | [01-product.md](01-product.md) | 已提供 |
| 独立插件源码、依赖、测试 | `community/apps/agri-service-workorder` | 已随 PR 提交 |
| 环境、构建、安装、配置、使用 | [02-runbook.md](02-runbook.md) | 已提供 |
| README 内真实运行截图（工作台 / 输入 / 结果 / 异常） | 插件 [README](../../README.md) | 已提供：工作台全貌 + AI 结果/待补充 + 对话补充 |
| 验证结果与未验证项 | [03-validation.md](03-validation.md) | 已提供 |
| AI 协作说明 | [04-ai-collaboration.md](04-ai-collaboration.md) | 已提供 |
| 基线 SHA、复用与 Git | [05-sources.md](05-sources.md) | 已提供 |
| 已知限制 | 本文 | 已提供 |
| PR → 上游 main | [#681](https://github.com/xpert-ai/xpert-plugins/pull/681) | 已创建 |
| 一次真实 AI | README 截图 2 | 已满足 |
| 插件工作台视图 | README 截图 1 | 已满足（`agri_service__workbench`） |
| 结果可查看/恢复 | 对话历史 + 工作台列表 + DB | 已满足 |
| 失败重试 | 待补充后可继续补全 | 已满足 |

## 已知限制

1. 工作台列表「确认处理 / 结案」等人工按钮路径未作为本 PR 必过项；核心已证明工作台可加载、可见业务数据与 AI 结果。  
2. 未对接真实派工/ERP；主数据导入为演示级。列表中可能混有骨架遗留样例行。  
3. 字段物理列名沿用通用工单命名，农服语义由提示词与 UI 承载。  
4. 未提交 plugin-dev-harness 正式跑通报告。  

## 面试演示建议顺序

安装插件 → 初始化 → 创建并发布「农服工单助手」→ 打开工作台 `?view=agri_service__workbench` → 填报/示例生成工单 → 查看待补充结果与列表 → 对照 README 截图说明取舍。
