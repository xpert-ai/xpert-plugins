# 05 · 参考资料与来源（面试官阅读版）

> **30 秒版**：所有结论都锚定在具体 commit 上（两仓 SHA）。工程骨架学的是 `community/apps/dockyard`，但业务码逐行自写；许可跟随上游 **AGPL-3.0**，没有引入任何未声明的第三方素材。平台行为不是猜的——远程组件协议、视图动作、插件表名、scope 规则都核对过实现或文档。
>
> **看这一份能判断**：来源是否可追溯、复用边界是否说清楚（题面 [26]/[75] 明确要求说明"来源、许可、复用范围、自己的改动"）。
> **一句话**：协议和骨架学上游，业务码自己写；许可 AGPL-3.0；文档链接全部对过现网标题。

---

## 1. 仓库（全部以 commit 为锚点）

| 仓库 | commit | 用途 |
| --- | --- | --- |
| `xpert-ai/xpert-plugins` | `dfad5423205811b3251628ee9bf59a79a4bcbd87` | 插件宿主仓库，fork 自这里，PR 回 `main` |
| `xpert-ai/xpert` | `3ddc380ca20373f9113a77411090de3c3da75e37` | 平台本体，本地源码启动与真机验收 |
| `xpert-ai/xpert-skills` | `5b00adc981300951d83025fab4426d7a46e177cc` | Agent Skills（开发指导） |

均为 `git clone --depth 1` 的 `main`。

## 2. 代码参照（读了什么、看什么）

| 路径 | 看什么 |
| --- | --- |
| `community/apps/dockyard` | business-app 型插件完整形态：`appConfig`、视图提供者、中间件、远程组件、模板 DSL、`docs/interview/*` 交付物结构 |
| `community/apps/smart-maintenance`、`community/apps/procurement-quote-comparison` | 更小的插件形态（organization / system 级）、`package.json` 约定 |
| `packages/plugins/*`（宿主仓库） | 内置插件如何注册 provider、中间件、视图 |
| `plugin-dev-harness/` | 插件加载层验证工具与它的 mock 边界（README 明写默认 mock DB/运行能力） |
| `@xpert-ai/plugin-sdk`、`@xpert-ai/contracts` 3.18.4 | 注册装饰器与视图/中间件/模板的类型契约（以类型定义为准） |

## 3. 文档（链接均核对过现网标题）

| 链接 | 主题 |
| --- | --- |
| https://docs.xpertai.cn/zh-Hans/ai/plugin/develop | 插件开发步骤（实现、构建、安装） |
| https://docs.xpertai.cn/zh-Hans/ai/plugin/remote-component | 工作台远程组件与宿主协议 |
| https://docs.xpertai.cn/zh-Hans/ai/middleware/custom | 自定义 Agent 中间件与工具暴露方式 |
| https://docs.xpertai.cn/zh-Hans/ai/plugin/install | 发布与安装插件 |
| https://docs.xpertai.cn/zh-Hans/ai/getting-started/community/local-source-code | 从本地源码启动平台 |
| https://docs.xpertai.cn/zh-Hans/ai/tutorial/dockyard-workbench-plugin | 工作台插件实战教程（Dockyard） |

## 4. 仓库内约定（比文档更权威的那几份）

| 文件 | 内容 |
| --- | --- |
| `community/README.md` | 包脚手架、本地安装、`--workspace-concurrency=1`、changeset 要求 |
| `community/env.example` | 本地安装环境变量模板（`XPERT_API_URL` / `XPERT_TOKEN` / `XPERT_ORG_ID` / `XPERT_INSTALL_SCOPE`） |
| `AGENTS.md`（仓库根、`community/`） | 仓库对编码代理的约束（提交范围、验证要求） |
| `tools/scripts/install-local-plugin.mjs`、`deploy-local-plugin.mjs` | `plugin:install:local` / `plugin:deploy:local` 的真实参数与 scope 校验规则 |

## 5. 平台行为依据（写实现时逐条核对过）

- 远程组件协议：`xpertai.remote_component`、`protocolVersion: 1`；握手 `ready` → `init`（带 `instanceId`），请求带 `requestId`，宿主只接受 `event.source === window.parent`。
- 视图动作走 `executeViewAction`，失败返回 `{ success: false, data: { code } }`，视图据此提示。
- 插件表名由 `pluginArtifactTableName(namespace, name)` 生成，`artifactNamespace` 必须与 `package.json` 的 `xpert.plugin.artifactNamespace` 一致。
- `xpert.plugin.level` 决定可用安装 scope：`organization` → `organization`；`system` / `tenant` → `tenant`。
- 工作台视图的打开方式：`/chat/x/<appSlug>/c?view=<provider>__<viewKey>&viewLayout=maximized`（参数名来自 `clawxpert-workbench-view-url-state.service.ts`）。

## 6. 许可、复用范围与自己的改动

| 项 | 内容 |
| --- | --- |
| 上游许可 | `xpert-ai/xpert-plugins` 为 **AGPL-3.0**（根 `LICENSE` 34523 B），`xpert-ai/xpert` 同为 AGPL-3.0 |
| 本插件许可 | `package.json` 写 **AGPL-3.0**，与宿主一致；未发布 npm 包（题面不要求） |
| 复用方式 | **只参考工程结构与协议约定，源码逐行自写**：目录布局、`xpert.plugin.*` 字段、视图 manifest 形状、`scripts/build-remote.mjs` 的构建套路按 dockyard 形态重写；未复制 dockyard 的业务码（它做工作台布局预览，与本选题无关） |
| 协议复用 | `xpertai.remote_component` v1 的握手/请求/错误约定按宿主协议文档理解后自写（`src/lib/remote/bridge.ts`），不是拷贝 |
| 依赖复用 | `@xpert-ai/plugin-sdk`、`@xpert-ai/contracts` 3.18.4 作为**直接依赖**使用类型与装饰器；其余为公开 npm 包（`typeorm`、`esbuild`、`tsx`、`zod`、`@langchain/core/tools`、`@nestjs/*`），无内部包 |
| 自己的改动 | 业务语义全部原创：三元归属、`pending/proposed/confirmed/failed` 状态机 + `revision` 乐观锁、两个工具、看板视图与四个动作、助手 DSL 与 prompt、11 条领域测试 |
| 生成方式 | 代码由 AI 编码代理起草、人工逐段审阅修改（见 [04-ai-collaboration.md](04-ai-collaboration.md)）；无第三方素材/字体/图标文件（图标用平台内置 `ri-*` 字体图标名） |
