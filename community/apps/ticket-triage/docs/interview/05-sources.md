# 参考资料与来源

整理日期：2026-11-03。所有仓库均以具体 commit 为锚点（题面要求记录基线 SHA）。

## 仓库

| 仓库 | 使用的 commit | 用途 |
| --- | --- | --- |
| `xpert-ai/xpert-plugins` | `dfad5423205811b3251628ee9bf59a79a4bcbd87` | 插件宿主仓库，fork 自这里，PR 回到 `main` |
| `xpert-ai/xpert` | `3ddc380ca20373f9113a77411090de3c3da75e37` | 平台本体，本地源码启动与实际验收 |
| `xpert-ai/xpert-skills` | `5b00adc981300951d83025fab4426d7a46e177cc` | Agent Skills（开发指导） |

均以 `git clone --depth 1` 取得，`main` 分支。

## 代码参照

| 路径 | 看什么 |
| --- | --- |
| `community/apps/dockyard` | business-app 型插件的完整形态：`appConfig`、视图提供者、中间件、远程组件、模板 DSL、`docs/interview/*` 交付物结构 |
| `community/apps/smart-maintenance`、`community/apps/procurement-quote-comparison` | 更小的插件形态（organization / system 级），package.json 约定 |
| `packages/plugins/*`（宿主仓库） | 内置插件如何注册 provider、中间件与视图 |
| `plugin-dev-harness/` | 插件加载层的验证工具与其 mock 边界（README） |
| `@xpert-ai/plugin-sdk`、`@xpert-ai/contracts` 3.18.4 | 注册装饰器与视图/中间件/模板的类型契约（以实际类型定义为准） |

## 文档

| 链接 | 主题 |
| --- | --- |
| https://docs.xpertai.cn/zh-Hans/ai/plugin/develop | 插件开发步骤（实现、构建、安装） |
| https://docs.xpertai.cn/zh-Hans/ai/plugin/remote-component | 工作台远程组件与宿主协议 |
| https://docs.xpertai.cn/zh-Hans/ai/middleware/custom | 自定义 Agent 中间件与工具暴露方式 |
| https://docs.xpertai.cn/zh-Hans/ai/plugin/install | 发布与安装插件 |
| https://docs.xpertai.cn/zh-Hans/ai/getting-started/community/local-source-code | 从本地源码启动平台 |
| https://docs.xpertai.cn/zh-Hans/ai/tutorial/dockyard-workbench-plugin | 工作台插件实战教程（Dockyard） |

## 仓库内约定

| 文件 | 内容 |
| --- | --- |
| `community/README.md` | 包脚手架、本地安装、构建并发限制（`--workspace-concurrency=1`）、changeset 要求 |
| `community/env.example` | 本地安装用的环境变量模板（`XPERT_API_URL` / `XPERT_TOKEN` / `XPERT_ORG_ID` / `XPERT_INSTALL_SCOPE`） |
| `AGENTS.md`（仓库根、`community/`） | 仓库对编码代理的约束（提交范围、验证要求） |
| `tools/scripts/install-local-plugin.mjs`、`deploy-local-plugin.mjs` | `plugin:install:local` / `plugin:deploy:local` 的真实参数与 scope 校验规则 |

## 平台行为依据（写实现时核对过）

* 远程组件协议：`xpertai.remote_component`，`protocolVersion: 1`，握手 `ready` → `init`（含 `instanceId`），请求带 `requestId`，宿主只接受 `event.source === window.parent`。
* 视图动作走 `executeViewAction`，失败返回 `{ success: false, data: { code } }`，视图据此提示。
* 插件表名由 `pluginArtifactTableName(namespace, name)` 生成，`artifactNamespace` 必须与 `package.json` 中 `xpert.plugin.artifactNamespace` 一致。
* `xpert.plugin.level` 决定可用的安装 scope：`organization` → `organization`；`system` / `tenant` → `tenant`。
