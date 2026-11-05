# 04 · AI 协作说明（面试官阅读版）

> **30 秒版**：AI 编码代理（DeepSeek Harness + 仓库内 Agent Skills）承担了读仓库、写代码、写文档、跑构建与部署；人承担了选题、验收口径、真机操作、以及逐个"看起来通过"的判别。**四问都有具体案例**：怎么介绍想法、做过哪些选择与调整、怎么一起定位问题、通过哪些测试确认。
>
> **看这一份能判断**：AI 用得像不像工程师（有没有隔离实验、有没有驳回 AI 的产出）、哪些结论是人真的验过的。
> **最值得看**：第 3 节第 3 问的 `team` → `owningTeam` 隔离实验；第 4 节"被人工驳回的六件事"。

---

## 1. 工具与代码来源

| 工具 | 用途 |
| --- | --- |
| AI 编码代理（DeepSeek Harness，deepseek-flash + 仓库内 Agent Skills） | 读仓库、写代码、跑构建/测试、排查环境问题、写文档 |
| Xpert Agent Skills（`xpert-agentic-app-developer`、`xpert-plugin-development`、`xpert-platform-local-environment`） | 确认插件贡献点、注册方式、本地平台启动方式 |
| 平台内模型（GLM 系列，OpenAI 兼容） | 运行期由助手调用两个工具完成真实分诊 |

代码来源：`community/apps/dockyard` 作为结构参照；接口形态由 `plugin-dev-harness`、`@xpert-ai/plugin-sdk`、`@xpert-ai/contracts` 3.18.4 的类型定义决定。AI 产出的是业务代码与文档草稿；接口契约、状态机语义、验收口径来自仓库约定与题面。

## 2. 分工（谁做什么，为什么不能互换）

| 环节 | 谁 | 原因 |
| --- | --- | --- |
| 选题与产品范围 | 人 | "人工确认是核心"是产品判断，AI 倾向把功能做全 |
| 环境准备（DB/Redis、账号、模型凭证） | 人 | 凭据与额度必须人给，且要求不落盘到仓库 |
| 读仓库、定接口、写实现 | AI | 逐文件读 dockyard 与 SDK 类型后按契约实现 |
| 构建 / 类型检查 / 域测试 / 插件加载 | AI 执行，人复核结论 | 命令与输出见 [03-validation.md](03-validation.md) |
| 平台侧业务流程验收 | 人操作，AI 记录 | 真实模型调用与人工确认必须在浏览器里由人完成 |
| 提交 PR | 人 | fork、分支、commit、PR 都在本人账号下 |

**能不能全交给 AI？**不能。界面上的真实操作、凭证、以及对"这次到底算不算跑通"的判断，都要人来；这也正是题面第九节要围绕作品提问的原因。

## 3. 对应题面的四个问题

**① 怎么介绍想法**

我给的是**约束**而不是需求：一条流程（工单 → 建议 → 人工确认）、要能在平台里演示、不接触真实客户数据。约束比需求更能让 AI 收敛——需求会发散成"还能做什么"，约束只会问"怎么在这条线上做对"。

**② 做过哪些选择与调整**

| 调整 | 前 | 后 | 触发原因 |
| --- | --- | --- | --- |
| 归属键 | 五元组（含 `workspaceId`/`userId`） | 三元组 `tenant + organization + xpertId` | 智能体侧看不到视图侧写入的数据（两侧 scope 不同源） |
| 工具参数名 | `team` | `owningTeam` | 托管模型每轮漏掉该必填字段（第 ③ 条） |
| 递归上限 | `recursionLimit: 8` | `40`，且 prompt 改成"同一轮内先列后提" | 8 不够，模型在一个回合里反复重试直到 `RecursionLimitReached` |
| 外壳结论 | "平台自带外壳不可用" | 补会员计划 + 让 provisioner 带上请求上下文 + 补 actor 权限后打通 | 不愿把"我没跑通"写成"平台不行" |

**③ 怎么一起定位问题（最有价值的一条）**

现象：`propose_ticket_triage` 稳定报 `Received tool input did not match expected schema`。

1. 先怀疑自己的 schema → 给每个字段补 `.describe()` 并重述"REQUIRED" → 仍然漏；
2. 说明不是提示词问题 → **绕过平台**：用 `convertToOpenAITool` 生成同一份 parameters，直接 POST 智谱的 OpenAI 兼容接口（key 从平台 `copilot_provider.credentials` 读）→ 模型返回的 arguments **包含** `team`；
3. 结论：JSON Schema 没问题，**参数在平台适配层被丢掉**；
4. 修法：把字段改名 `owningTeam`（并在 `describe()` 里再写一遍枚举）→ 两次运行都稳定通过。

这条的价值不在"改个名字"，而在于**用一次隔离实验把"模型错"和"平台错"分开**——否则很容易一直在改 prompt。

**④ 通过哪些测试确认**

域逻辑 11 个用例（状态机、冲突、幂等、跨租户）→ harness 插件加载 → 真实 `view-hosts` 的 slots/data/actions → 浏览器里真点一次确认 → 重启 API 后数据仍在 → 第二个租户打不进来。逐层结果与"每层证明不了什么"见 [03-validation.md](03-validation.md)。

## 4. AI 产出被人工驳回/修正的六件事（说明不是照单全收）

1. 视图入口写成 `../../remote/...`，构建能过但运行期取不到 HTML → 改 `../remote/...`。
2. 测试脚本写 `tsx --test tests/*.test.ts`，Windows 不展开 glob 导致 0 测试 → 写死文件名。
3. 把 `config` / `templates` 放进 `plugin.meta`，类型检查报错 → 移到 `XpertPlugin` 顶层。
4. 想用 `thinking: {type:'disabled'}` → 平台返回 1210「该模型始终思考」→ 改 `low`。
5. 曾把"500–1000 次模型调用"当验收成本写进估算 → 被要求按文档原文重读后收回（文档只要求"一次真实 AI 处理 + 一个失败重试场景"）。
6. 曾把"平台自带外壳不可用"写进已知限制 → 被要求先补到跑通再说，最终补通并附三堵墙记录。

## 5. 实际使用的提示路径

1. `$xpert-platform-local-environment`：确定"基础设施容器化 + API/Cloud UI 从源码跑"的启动方式。
2. 读 `community/apps/dockyard`：拿 business-app 型插件的完整骨架（meta、appConfig、视图提供者、中间件、远程组件、模板 DSL）。
3. `$xpert-agentic-app-developer`：确认视图/中间件/模板注册点与远程组件协议版本。
4. 写实现 → `typecheck` → `domain.test.ts` → `build` → `plugin-dev-harness`。
5. 部署到本地平台 → 人工确认流程 → 记录证据。

## 6. 不能由 AI 代替的部分（面试时会问到）

- 模型凭证与额度、账号与插件安装权限；
- 界面上的真实操作（载入工单、确认分诊、刷新恢复）与截图；
- 对设计取舍的解释：为什么人工确认是核心、为什么用乐观锁、失败重试为什么不新建记录。
