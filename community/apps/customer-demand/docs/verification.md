# 验证记录

验证日期：2026-09-22。

| 范围 | 证据 | 结果 |
| --- | --- | --- |
| 类型和构建 | `npm run typecheck`, `npm run build` | 通过 |
| 服务行为 | `npm test`，8 项测试 | 通过 |
| 生产产物边界 | `npm run verify:dist` | 入口、模板、资源哈希、无客户端密钥/外部模型端点/Web Storage |
| 插件加载 | `plugin-dev-harness` | 模块加载、Nest 依赖注入、关闭均通过 |
| Xpert Remote View 协议 | `npm run preview:fixture` + 浏览器完成确认 | 通过；使用仓库共享预览宿主和生产 UI bundle |
| 真实 Jev | `npm run test:live` | 解析模型 `jev-1.13.0`，保存→评估→确认通过 |
| 浏览器完整链路 | 真实 Jev + SQL.js | 新建、评估、人工覆盖、确认、重启恢复通过 |
| 失败恢复 | 模拟一次服务繁忙后真实重试 | 同一记录保留原文；attempts 为 `failed,succeeded`；重试后进入 review |
| 语言与布局 | 中文桌面、英文深色移动视口 | 通过 |

服务测试覆盖：

- 数据库导出后新连接恢复；
- 模型失败重试及成功结果幂等；
- tenant、organization、user 跨范围拒绝；
- 乐观版本冲突、修改原文使旧决定失效；
- 幂等键内容冲突；
- 并发评估只预留一个 attempt，评估中禁止修改；
- 超时租约恢复且旧结果不可覆盖；
- 搜索、状态筛选和分页。

## 截图说明

- `local-real-jev-confirmed.png`：本地集成宿主、真实 Jev 和持久化数据库；不是完整 Xpert 安装验收。
- `local-failure-preserved.png`：一次受控模型失败后，客户原文仍在且可重试。
- `xpert-remote-view-fixture.png`：Xpert 插件仓库共享 Remote View 预览宿主；固定数据，不代表真实 Jev 调用。
- `responsive-dark-en.png`：英文、深色、移动视口。

当前尚缺完整 Xpert 服务安装后的平台截图和重启验证。共享预览与 plugin-dev-harness 是强于静态页面的协议/运行时证据，但不能代替该项，提交面试前应在目标环境补齐并更新本文件。
