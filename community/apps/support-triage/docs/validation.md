# 验证记录

记录日期：2026-09-15。本文件如实区分代码测试、模拟宿主和真实 Xpert 验收。

## 版本和运行环境

| 项目 | 实际值 |
| --- | --- |
| 平台 main 基线 | `01aa0f76eb96ef88e8a435d7d99832c7b7138560` |
| 插件 main 基线 | `f96b94c3f0915261fc3ff4835572ec8c0c61de4f` |
| 功能分支 | `feat/support-triage-workbench` |
| Node / npm / pnpm | `24.16.0` / `11.13.0` / `8.15.8` |
| SDK / contracts | `3.18.4` / `3.18.4` |
| TypeScript / TypeORM / SQL.js | `5.9.2` / `0.3.24` / `1.13.0` |
| React / Playwright | `18.3.1` / `1.62.1` |
| 本地浏览器 | Windows 上已安装的 Microsoft Edge，headless |
| 本地 UI 构建 | `TRIAGE_ESBUILD_WASM=1`，esbuild-wasm `0.25.10` |

本轮实际测试源码提交：`f35b3fdb5d1adf1b15628142debfd00d9895c010`；其后的验收记录补充只修改文档。后续真实平台测试 SHA 将随最终 PR 提供。构建生成 `dist/build-manifest.json`，记录源代码与产物哈希；构建产物不提交 Git。`verify:dist` 检查源码与产物仍一致。

## 四层验证

| 层次 | 执行内容 | 当前结果 | 证据范围 |
| --- | --- | --- | --- |
| 1. 业务与构建 | 类型检查、后端测试、完整构建、资源哈希检查 | 21 项后端测试通过；构建与类型检查通过 | 实际 SQL.js / TypeORM；不是 Xpert 的 PostgreSQL |
| 2. 插件生命周期 | 官方 plugin-dev-harness | 入口加载、Nest 初始化与销毁通过 | harness 默认 mocks 开启 |
| 3. 界面集成 | 真实构建资源、官方预览宿主、Playwright | 5 项测试通过，0 失败，耗时约 19.8 秒 | 模拟宿主、合成 AI；页面刷新保留预览服务器内存 |
| 4. 真实平台 | 安装、助手初始化、真实模型、持久化与重试 | **未执行** | 等待 Windows 重启、WSL/Docker 与模型配置 |

### 1. 业务与构建

从插件目录执行：

```sh
corepack pnpm typecheck
corepack pnpm build
corepack pnpm test
corepack pnpm verify:dist
```

后端 21 项测试覆盖：

- 创建、分析、人工修改确认、保存与重新读取。
- 创建和确认的幂等性；重复请求内容改变、并发操作与过期版本拒绝。
- 租户、组织、工作区、用户和助手五维隔离；身份缺失时拒绝访问。
- 严格字段校验与逐字原文证据；不存在的引用不能保存。
- 失败、超时、重新尝试及旧批次回调拒绝。
- 过期回收与新批次交错执行时，旧结果不能写入新批次。
- 数据库导出到磁盘、关闭连接、重新连接后恢复记录。
- 模板、中间件、View 动作允许列表；Agent 无人工确认能力。
- 实际中间件工具调用持久化，宿主命令失败后立即释放尝试。

安装依赖时，固定基线的 `@xpert-ai/chatkit-types` 对 LangChain 主版本报告 peer warning。当前插件遵循 SDK `3.18.4` 与现有示例的 `@langchain/core 0.3.72`，上述测试通过；真实平台兼容性仍须第四层验证，不以忽略警告代替验收。

提交时仓库的 Entity 表名 pre-commit 检查通过；它对本插件现有 `plugin_` 表名前缀给出 v1 兼容提示。额外执行全仓库 `node scripts/check-app-view-storage.mjs` 未通过，命中上游 `drawio/viewer-static.min.js` 和 `story-studio/studio-panel-layout.tsx`。这些文件相对 main 基线没有改动；本插件独立构建扫描和禁用 Web Storage 的浏览器测试通过。未将全仓库检查记为通过，也未混入对其他应用的修改。

### 2. 官方生命周期

先按仓库 `plugin-dev-harness/README.md` 安装并构建工具，再从插件仓库根目录执行：

```sh
node plugin-dev-harness/dist/index.js \
  --workspace ./community/apps/support-triage \
  --plugin @community/apps-support-triage
```

实际结果包含 `mocks: enabled`、`Plugin loaded successfully.`、`Application context closed`。这证明插件入口与初始化可加载，不能证明真实数据库、账号权限、客户端桥接或真实 AI 已经可用。

### 3. 界面集成

从插件目录执行：

```sh
corepack pnpm exec playwright install chromium
corepack pnpm test:ui
```

也支持 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指向已安装的 Edge/Chrome。`PLAYWRIGHT_MODULE` 仅用于开发环境复用外部 Playwright 模块；正常安装本包开发依赖无需设置。

测试使用生产构建资源，通过官方 Remote View Preview Host 驱动桥接；预览外层始终显示“模拟 AI”横幅。断言业务结果、人工编辑、确认、刷新、失败重试、并发编辑保护、命令失败恢复、英文与深色主题、窄屏无横向溢出，并捕获浏览器错误。模拟结果不会进入生产代码路径。

另外，专项测试使用真实 Provider 的 `result.data.code` 结构模拟保存竞争冲突，确认 UI 显示可操作提示并保留人工编辑。它避免用不同于真实服务的错误包装掩盖集成问题。

README 的三张截图来自本层，已逐张检查布局和可读性。它们不证明真实 AI、真实 Xpert 权限和服务重启持久化。

### 4. 真实 Xpert 验收清单

下列项目均待执行，具体步骤见 [安装与助手初始化](plugin-runbook.md)。

- [ ] source-hybrid 平台启动，记录实际 platform SHA 和服务健康。
- [ ] 插件 tenant 安装成功；重启后 descriptor 与实体可用。
- [ ] App/Assistant 模板可见；创建助手，绑定主模型、中间件与 Workbench 并发布。
- [ ] 点击分析发起真实模型调用，三个工具按预期执行并保存结构化结果。
- [ ] 人工修改确认后，刷新、重新进入、重启服务仍可恢复。
- [ ] 制造一次真实模型或外部服务失败，修复后成功重试。
- [ ] 在真实宿主中验证作用域拒绝与并发冲突。
- [ ] 将真实平台输入、AI 结果、恢复与异常截图提交到 README。
- [ ] 完成最终差异检查，向上游 main 提交 PR，并记录实际测试提交 SHA。

## 当前环境进展

用户运行 `wsl --install -d Ubuntu` 时返回 HTTP 403。已取得并校验官方 WSL MSI、Ubuntu WSL 镜像和 Docker Desktop 安装器。用户提供的截图确认 `VirtualMachinePlatform` 已启用；操作系统重启和后续安装仍待完成。未把 Windows 环境问题描述为 Xpert 平台故障。

题目所附“已验证完整示例”的链接仍是招聘方待补占位。本插件已依据固定基线源码和实际 SDK 实现；未据此虚构平台验收结果。
