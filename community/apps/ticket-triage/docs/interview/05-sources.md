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

## 许可、复用范围与自己的改动

题面要求说明"来源、适用许可、复用范围和自己的改动"（[26]、[75]、表 1 的"复用来源"）。

| 项 | 内容 |
| --- | --- |
| 上游许可 | `xpert-ai/xpert-plugins` 为 **AGPL-3.0**（仓库根 `LICENSE` 34523 B），`xpert-ai/xpert` 同为 AGPL-3.0 |
| 本插件许可 | `package.json` 的 `license` 写成 **AGPL-3.0**，与宿主仓库一致；未公开发布 npm 包（题面不要求） |
| 复用方式 | **只参考工程结构与协议约定，源码逐行自写**：目录布局、`package.json` 的 `xpert.plugin.*` 字段、视图 manifest 形状、`scripts/build-remote.mjs` 的构建套路，均按 `community/apps/dockyard` 的形态重写；未复制 dockyard 的业务码（它做的是工作台布局预览，与本选题无关） |
| 协议复用 | `xpertai.remote_component` v1 握手/请求/错误约定按宿主协议文档与 dockyard 的 bridge 实现理解后自写（`src/lib/remote/bridge.ts`），不是拷贝 |
| 依赖复用 | `@xpert-ai/plugin-sdk`、`@xpert-ai/contracts`（3.18.4，与 dockyard 同版本）作为**直接依赖**使用类型与装饰器，不做代码复制；其余依赖为 `typeorm`、`esbuild`（构建）、`tsx`（测试）、`zod`、`@langchain/core/tools`、`@nestjs/*`，全部为公开 npm 包，无内部包 |
| 自己的改动 | 全部业务语义是本选题原创：工单实体与 `tenantId + organizationId + xpertId` 三元归属、`pending/proposed/confirmed/failed` 状态机与 `revision` 乐观锁、两个工具（`list_pending_tickets` / `propose_ticket_triage`）、看板视图与四个动作（`seed_tickets` / `confirm_triage` / `reject_triage` / `reset_ticket`）、助手 DSL 与 prompt、11 条领域测试 |
| 生成方式 | 代码由 AI 编码代理起草、人工逐段审阅与修改（分工见 `04-ai-collaboration.md`）；不涉及第三方素材、字体、图标资源（图标用平台内置 `ri-*` 字体图标名） |

一句话：**协议和骨架学上游，业务码自己写；许可跟随上游 AGPL-3.0；没有引入任何未声明的第三方素材。**
