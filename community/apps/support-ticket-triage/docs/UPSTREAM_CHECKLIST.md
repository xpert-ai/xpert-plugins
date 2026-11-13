# 上游接入检查表

## 代码接入

- [ ] Fork `xpert-ai/xpert-plugins`
- [ ] 从上游 `main` 创建功能分支
- [ ] 记录上游 Xpert 与 xpert-plugins commit SHA
- [ ] 将目录复制到 `community/apps/support-ticket-triage`
- [x] 使用社区应用包名 `@community/apps-support-ticket-triage`
- [ ] 确认实际 SDK、contracts 和 shadcn 包版本
- [ ] 更新 `community/pnpm-lock.yaml`
- [ ] 添加 changeset（若上游要求）

## 工程验证

- [ ] test
- [ ] typecheck
- [ ] build
- [ ] metadata check
- [ ] release dependency check
- [ ] plugin-dev-harness

## 平台验收

- [ ] 配置 `community/.env`，不提交真实 Token
- [ ] 安装插件并处理 `restartRequired`
- [ ] 验证插件 descriptor 和实时能力
- [ ] 发布 Assistant 模板并选择模型
- [ ] 完成真实 AI 工具调用
- [ ] 验证刷新恢复
- [ ] 验证失败与重试
- [ ] 将真实截图放入 `evidence/`

## PR

- [ ] 最终差异不包含临时文件、Token 或客户真实信息
- [ ] README 使用相对路径展示截图
- [ ] PR 填写基线 SHA、实际测试版本和未验证项
- [ ] PR 指向上游 `main`，无需合并
