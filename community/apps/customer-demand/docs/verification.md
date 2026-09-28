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
| 完整 Xpert 平台安装 | 本地 Docker 平台（`ghcr.io/xpert-ai/xpert-api/webapp`），`POST /api/plugin` 代码安装 + 重启激活 | 插件进入"已安装"列表；见 `xpert-platform-plugin-installed.png` |
| 平台内完整业务闭环 | 真实登录 → 从助手模板创建并发布"客户需求评估助手" → 对话页工作台新建需求 → Jev 评估 → 人工确认 | 通过；实际模型 `jev-1.13.0`，分类置信度 100%，紧迫性评分 1.79；见 `xpert-platform-confirmed.png` |
| 平台重启恢复 | `docker compose restart` 全部容器后重新登录 | 记录、评估历史与跟进决定完整保留；见 `xpert-platform-restart-recovery.png` |

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
- `xpert-platform-plugin-installed.png`：完整 Xpert 平台的"插件"管理页，插件出现在已安装列表。
- `xpert-platform-confirmed.png`：平台对话页内的工作台完成"评估 → 人工确认"，展示原文、信息完整度概率和 Jev 建议。
- `xpert-platform-restart-recovery.png`：全部平台容器重启后，同一条记录以"已确认"状态完整恢复。

## 平台验收环境记录（2026-09-22）

- 平台：本地 Docker Compose，`ghcr.io/xpert-ai/xpert-api:latest` + `xpert-webapp:latest`，仅监听 127.0.0.1。
- 插件工作区以只读方式挂载进 API 容器（`../app:/srv/xpert/workspace/customer-demand:ro`；API 只接受 `/srv` 下的 `workspacePath`）。
- 安装：`POST /api/plugin`（`source: "code"`、SUPER_ADMIN JWT、`x-scope-level: tenant`），随后重启 API 激活；更新代码后用 `POST /api/plugin/refresh` 重装。
- 服务端 `TYPESAFE_API_KEY` 通过 `jev.env` 注入 API 进程，不出现在浏览器或插件配置中。
- 验收中发现并修复一处集成缺陷：视图清单缺少 `querySchema.supportsSelection: true`，平台在动作后携带 `selectionId` 刷新列表会被 400 拒绝（共享预览宿主不校验该项，因此此前未暴露）。修复后重装插件，闭环与重启恢复均通过。
