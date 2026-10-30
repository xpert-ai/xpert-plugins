# 验证记录

## 构建与类型检查

```sh
pnpm --filter @xpert-ai/plugin-agri-service-workorder build
pnpm --filter @xpert-ai/plugin-agri-service-workorder test
```

结果：通过。

## 平台业务流程

| 场景 | 操作 | 结果 |
| --- | --- | --- |
| 完整需求 | 发送东河村水稻稻瘟病描述 | 生成 `SM-20260920-7469` 待确认，字段完整可读 |
| 缺信息 | 发送「有个农户水稻有病，帮我开单」 | 生成 `SM-20260920-0215` 待补充，并列出需补项 |
| 持久化 | 刷新后仍可在对话历史看到工单号与内容 | 通过 |
| 工作台 | `?view=agri_service__workbench` | 曾出现 View 404；已调整 activation，未作为本 PR 必过项 |

## 未验证

- 多组织数据隔离自动化用例  
- plugin-dev-harness 全量生命周期（可后续补跑）  
- 真实派工系统回写  
