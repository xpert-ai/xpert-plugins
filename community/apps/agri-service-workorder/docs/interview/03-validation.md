# 验证记录

## 1. 构建与类型检查

```sh
pnpm --filter @xpert-ai/plugin-agri-service-workorder build
pnpm --filter @xpert-ai/plugin-agri-service-workorder test
```

结果：通过。

## 2. 插件加载

- 本地工作区安装 `@xpert-ai/plugin-agri-service-workorder`：成功  
- 插件页可见并完成「初始化」：成功  

未单独跑 `plugin-dev-harness` 全量（可后续补）；不以 harness 替代真实业务验收。

## 3. 平台业务流程

| 场景 | 操作 | 预期 | 实际 |
| --- | --- | --- | --- |
| 完整业务流程 | 完整农服描述 → AI 工具保存 | 待确认工单 + 结构化字段 | 通过，工单 `SM-20260920-7469`，见 README 截图 1 |
| 保存与恢复 | 刷新后回到对话历史 | 仍能看到工单号与内容 | 通过 |
| 输入与空/不足 | 仅「有个农户水稻有病，帮我开单」 | 待补充 + 缺口提示 | 通过，工单 `SM-20260920-0215`，见 README 截图 2 |
| 失败与重试 | 待补充后继续补全信息 | 可继续完善，不要求静默重复造脏数据 | 通过（对话补全路径） |
| 工作台点选保存 | `?view=agri_service__workbench` | 列表详情保存 | **未完全验收**（曾 404，见缺口说明） |

## 4. 尚未验证

- 多组织数据隔离自动化  
- plugin-dev-harness 正式报告  
- 工作台 iframe 人工点选「保存/确认处理」完整 UI 路径  
