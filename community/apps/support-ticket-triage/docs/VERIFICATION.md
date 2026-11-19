# 验证记录

## 已执行

执行日期：2026-11-11

```text
npm test
tests 5
pass 5
fail 0
```

覆盖内容：

- AI 分析完成后必须进入人工复核状态。
- 只有失败工单可以重试。
- 已批准工单不能重复批准。
- 模型置信度被限制在 0 到 1。
- 重复或空证据会被清理。
- 缺失类别、摘要或回复草稿的模型输出会被拒绝。

## 待上游工作区验证

- `pnpm install --frozen-lockfile`
- TypeScript typecheck
- Remote View 构建及产物新鲜度
- 插件完整构建
- `check-plugin-metadata`
- `plugin-dev-harness` 生命周期加载
- 本地 Xpert 安装、重启和实时能力检查
- Assistant 模板发布与模型选择
- 真实模型调用、工具调用和 Workbench 刷新恢复
- 宽屏和窄屏 Remote View 可用性

## 验证原则

未执行的项目不写“通过”。平台验证应记录 Xpert 与 xpert-plugins 的实际 commit SHA、命令、返回码、脱敏日志和真实运行截图。
