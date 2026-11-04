# AI 协作说明

整理日期：2026-11-03。本节说明这道题里 AI 做了什么、人做了什么、哪些结论是人验证过的。

## 使用的工具

| 工具 | 用途 |
| --- | --- |
| AI 编码代理（DeepSeek Harness，deepseek-flash 模型 + 仓库内 Agent Skills） | 读仓库、写代码、跑构建与测试、排查环境问题 |
| Xpert Agent Skills（`xpert-agentic-app-developer`、`xpert-plugin-development`、`xpert-platform-local-environment`） | 了解插件贡献点与本地平台启动方式 |
| 平台内模型 | 运行期由助手调用两个工具完成真实分诊（GLM 系列，OpenAI 兼容协议） |

代码来源：仓库内既有实现（`community/apps/dockyard`）作为结构参照，`plugin-dev-harness`、`@xpert-ai/plugin-sdk`、`@xpert-ai/contracts` 的类型定义决定接口形态。AI 生成的部分是业务代码与文档草稿；接口契约、状态机语义、验收口径来自仓库与题面。

## 分工

| 环节 | 谁做 | 说明 |
| --- | --- | --- |
| 选题与产品范围 | 人 | 决定了"人工确认"是产品核心，AI 只做建议 |
| 环境准备（Docker/PG/Redis、账号与模型凭证） | 人 | AI 给出命令与排错，凭据由人提供，不落盘到仓库 |
| 读仓库、定接口、写实现 | AI | 逐文件读 dockyard 与 SDK 类型，按契约实现 |
| 构建、类型检查、域测试、插件加载验证 | AI 执行，人复核结论 | 命令与输出见 `03-validation.md` |
| 平台侧业务流程验收 | 人操作界面，AI 记录 | 真实模型调用与人工确认必须由人在浏览器里完成 |
| 提交 PR | 人 | fork、分支、commit、PR 由本人账号发起 |

## 提示路径（实际使用的顺序）

1. `$xpert-platform-local-environment`：确定"基础设施容器化 + API/Cloud UI 从源码跑"的启动方式。
2. 读 `community/apps/dockyard`：拿到 business-app 型插件的完整骨架（meta、appConfig、视图提供者、中间件、远程组件、模板 DSL）。
3. `$xpert-agentic-app-developer`：确认视图/中间件/模板的注册点与远程组件协议版本。
4. 写实现 → `typecheck` → `domain.test.ts` → `build` → `plugin-dev-harness`。
5. 部署到本地平台 → 人工确认流程 → 记录证据。

## AI 产出中被人工驳回/修正的东西

* 早期把视图入口路径写成 `../../remote/...`，构建能过但运行期取不到 HTML，改成 `../remote/...`。
* 早期测试脚本写 `tsx --test tests/*.test.ts`，Windows 下不展开 glob 导致 0 测试，改成写死文件名。
* 早期把 `config`、`templates` 放进 `plugin.meta`，类型检查报错后改到 `XpertPlugin` 顶层。
* 早期想用 `thinking: {type:'disabled'}`，平台返回 1210 错误（该模型始终思考），改成 `low`。
* 曾把"500–1000 次模型调用"当成验收成本写进估算，被要求按文档原文重读后收回。

## 不能由 AI 代替的部分

* 模型凭证与额度、账号与插件安装权限。
* 界面上的真实操作（载入工单、确认分诊、刷新恢复）与截图。
* 面试时对设计取舍的解释：为什么人工确认是核心、为什么用乐观锁、失败重试为何不新建记录。
