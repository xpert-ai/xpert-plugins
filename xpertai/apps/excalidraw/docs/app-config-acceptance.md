# Excalidraw 0.13.1 App 配置与本地部署验收

验收日期：2026-09-06。目标 API：`http://localhost:3333`。

## 应用配置

- 稳定 App key：`excalidraw`；入口模板：`excalidraw-assistant`。
- `scope: organization`，专用组织共享工作空间，`assistant-chat` 入口。
- 中英文介绍、功能、使用场景、数据范围和初始化步骤已声明。
- 详情页使用宿主的图标、长介绍和使用场景展示；本次未把含验收数据的测试截图放进应用素材。
- 初始化只要求组织可用的主语言模型，不创建知识库；技术图助手继续单独提供。
- 配置源码位于 `src/lib/excalidraw.app-config.ts`，运行时与便携清单一致性由 `verify:dist` 和真实解包检查验证。
- 修复字体预设工具中仅适用于 Sites 的 `css: undefined` 字段导致 JSON 输出校验失败的问题，增加原生 MCP adapter 回归测试。

## 结果

| 验证 | 结果 |
| --- | --- |
| Nx 插件构建、测试及类型检查 | 20 个套件、146 项测试通过 |
| Nx 宿主 App 配置相关测试 | 3 个套件、16 项测试通过 |
| `verify:dist` / `verify:pack` | 通过，真实 tarball 解压后验证元数据和资产 |
| `plugin-dev-harness` | 注册、启动、bootstrap、销毁和停止通过 |
| `plugin:deploy:local` | system / Default tenant 刷新成功，已处理 `restartRequired` |
| 运行中描述符 | `0.13.1` / `loaded` / `valid` |
| App catalog / detail | 唯一 App、正确模板关联、配置与构建一致 |
| 缺少组织上下文 | 初始化预检查拒绝，未返回模型选项 |
| 当前组织预检查 | `canInitialize: true`，主模型可用 |
| MCP | 38 个工具、预览资源读取、字体预设真实调用通过 |
| 浏览器 | Explore 中文详情、功能卡片、数据范围、MCP 连接区和初始化抽屉已验证 |

组织应用状态为 `not_installed`：本次完成插件配置和部署，未执行组织资源初始化。用户可从 Explore 应用详情中的“应用到当前组织”进入平台初始化流程。

## 证据与复验

部署、安装检查和 npm 包元数据分别保存在 `test-output/app-config/deployment.json`、`installed.json`、`tarball.json`。最终 tarball 为 `test-output/app-config/xpert-ai-plugin-excalidraw-0.13.1.tgz`（35,071,286 bytes）。这些本地交付文件不包含在插件 npm 包中。

只读复验使用 `scripts/smoke-app-config.mjs`，设置 `XPERT_HOST_CHECKOUT`、`XPERT_ORGANIZATION_ID`，以及可选的 `XPERT_API_URL`。脚本通过宿主凭据助手认证，凭据仅存在于进程内存。

本地构建继续使用包含上一轮 MCP 扩展的宿主 SDK。依赖声明保留 SDK 3.18.3 / contracts 3.18.2 基线；正式 npm 发布仍需先发布包含新 MCP 接口的 SDK 并更新依赖，详见 `native-mcp-acceptance.md`。
