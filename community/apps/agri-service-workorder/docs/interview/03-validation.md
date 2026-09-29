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
| 工作台视图 | `?view=agri_service__workbench` | 绑定助手的工作台可加载 | 通过，见 README 截图 1 |
| 完整业务流程 | 农服描述 → AI 工具保存 | 结构化工单 + 可查看 | 通过，工单 `SM-20260929-0349`，见 README 截图 2 |
| 保存与恢复 | 刷新后回到对话/列表 | 仍能看到工单号与内容 | 通过 |
| 输入与空/不足 | 缺关键信息或需现场复核项 | 待补充 + 缺口提示 | 通过，状态 `needs_supplement`，见 README 截图 2 |
| 失败与重试 | 待补充后继续补全 | 可继续完善 | 通过（对话补全路径） |
| 对话路径补充 | 早期完整/残缺需求 | 待确认 / 待补充 | 通过，见 README 截图 3–4 |

## 4. 尚未验证

- 多组织数据隔离自动化  
- plugin-dev-harness 正式报告  
- 工作台列表内「确认处理 / 结案」全量按钮路径（本交付以工作台可见 + AI 建单 + 待补充为主）  
