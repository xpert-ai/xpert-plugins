# 面试交流备忘

> 准备稿，不是交付物。数字与结论都能在 [03-validation.md](03-validation.md) 与 [evidence.json](evidence.json) 里回查。

## 60 秒版

客服每天收到的工单，先要有人读一遍、定优先级、判断归哪个组、写第一封回复，然后才能往下走。我把"读 + 判断 + 起草"交给助手，把"签字"留给人：助手只能提交**分诊建议**（优先级、承接组、判断依据、回复草稿），工单变成"待确认"；人确认、改派或退回之后才算完成。助手在任何情况下都不能自己关闭工单。

## 我做的三个取舍（以及为什么）

1. **只做一条流程**：工单 → 建议 → 人工确认。没做多角色、没做 SLA、没做知识库检索。这道题要看的是"能不能在平台上跑通一次真实使用"，摊开做三件事不如把一件事做到底。
2. **AI 只写状态，不做最终决策**：`propose_ticket_triage` 只能把工单写成 `proposed`，`confirm` 只能由看板的视图动作触发。这是产品判断，不是技术限制——分诊错了直接影响客户，必须留一个人在回路里。
3. **看板按"租户 + 组织 + 助手"归属，不按人**：一开始按人隔离，结果智能体侧看不到视图侧写入的数据（见追问 1）。共享团队看板本来就不该按人切，收敛成三元组后两侧一致。

## AI 在这道题里的真实分工

- **我**：选题目、定验收口径（什么叫"真的跑通了"）、在真机上跑、判断哪些"看起来通过"其实是假的。
- **AI**：读两个仓库、写插件与测试、写文档、跑构建与部署，我逐轮抽查。

对应文档里那四个问题：

- **怎么介绍想法**：我给的是约束而不是需求——一条流程、要能演示、不碰真实客户数据。
- **做过哪些选择与调整**：五元组（含用户/工作区）→ 三元组；`team` → `owningTeam`；"外壳不可用"→ 补会员计划与 provisioning 权限后打通。
- **怎么一起定位问题**：`propose_ticket_triage` 一直报 `Received tool input did not match expected schema`。先怀疑 schema，给每个字段补 `.describe()` 仍失败，说明不是提示词问题。于是绕过平台把同一份 JSON Schema 直接打到智谱的 OpenAI 兼容接口，模型老老实实返回了 `team`——问题定位到"平台适配层丢了参数"。改名后一次通过。
- **怎么确认**：域逻辑 11 个用例、harness 插件加载、真实 `view-hosts` 的 slots/data/actions、浏览器里真点一次确认、重启 API 后数据仍在、第二租户打不进来。

## 三分钟讲实现

插件向平台贡献四件东西：一个助手模板（含中间件节点）、一个 Agent 中间件（两个工具）、一个视图提供者（`agent.workbench.main` / `agent.workbench.fixed` 两个 slot）、一个自带打包的 remote component（iframe，走 `xpertai.remote_component` 协议：`ready` → `init` → `requestData` / `executeAction`）。

工具与视图共用同一个 service，所以"助手写的"和"人看到的"是同一份数据。写操作带乐观锁：客户端给 `expectedRevision`，服务端 `update … where revision = ?`，`affected !== 1` 返回 `conflict`，人不会覆盖掉别人刚做的决定。

## 大概率被追问的八个问题

1. **为什么是三元组？** 视图侧 `XpertResolvedViewHostContext` 给的是 `hostId`，智能体侧 `IAgentMiddlewareContext` 给的是 `xpertId`，而 `workspaceId` 在普通助手对话里不保证存在（只有 project agent 分支才注入）。实测日志打出两侧三个值一致、`workspaceId` 只有一侧有，按它做键必然对不上。
2. **`team` 那个坑到底怎么回事？** 我做了隔离实验（同一份 schema 直连模型 API，模型会返回 `team`），所以是我的代码与平台适配层之间丢的，不是模型或 schema 的问题。改名 `owningTeam` 后稳定。风险提示：换模型或升级平台要重验这条。
3. **平台自带外壳你到底跑通没有？** 跑通了，代价是三件 seed 数据库里没有的东西：`FEATURE_MEMBERSHIP_PLAN` 特性开关 + 一条默认 `membership_plan`（否则 `application_trial_unavailable`）、`copilot.role='primary'` + 把请求上下文提前到 `models.resolve()` 之前（否则 `application_model_binding_unavailable`，其中"后台任务里取不到 provider"这一条看着像宿主侧真实缺陷）、以及平台自己的 provisioning actor 需要 57 条权限（否则 `application_preparation_failed`）。补齐后 `ready:true`，截图 13/14 就是 `/chat/…` 外壳里的 `工单分诊` tab。没配这些的机器上仍可用 `tests/browser/` 的替身宿主复现 06–12。
4. **失败是真的吗？** 不是。界面上的"需重试"是 SQL 造出来的 `failed` + `model_timeout`，我展示的是"失败状态可理解 → 重试不重复建单"。文档表 2 允许模拟，但我在三处文档里都标了，没冒充真实故障。
5. **权限做到什么程度？** 域测试覆盖跨租户不可读；平台层另建第二个租户实测：工作区 `total=0`、视图数据 `404 Not found xpert … in current tenant`、对话报记录不存在、模板列表里没有本插件。没做的是行级权限与"同租户两组织"的隔离。
6. **为什么不做批量分诊？** 一批建议一起提交，人就只能整批点"同意"，复核变成走过场。故意一张一张提，是这个产品判断的结果，不是赶时间。
7. **文档写 2–6 小时，你花了多久？** 远超。插件本体约 600 行 TS 加一个自带打包的前端；时间主要花在"让平台在这台 Windows 机器上真的能起来"（tailwind 的 `.cmd` 调用、目录 fsync、插件动态 `import`、provider YAML 定位、deploy 脚本的 spawn），以及后面想验证"平台自带入口"时挖出来的会员计划链路。
8. **如果给你两周？** 真实故障注入（打断网关）→ 行级权限与同租户两组织 → `seed_tickets` 从工具栏收进初始化流程 → 批量提议但逐条确认 → 退回理由回灌下一次提议。

## 背下来的数字

- 域测试 **11 / 11**；remote component 打包 **148 754 字节**（自包含单文件）。
- 演示数据 4 张工单；AI 两次真实回合；人工动作三次（确认 / 退回 / 改派确认）；整个流程里表里始终 4 行，没有重复建单。
- PR：`community/apps/ticket-triage`，**52 个文件、+3284、5 个 commit**；基线 `xpert-plugins@dfad542`、`xpert@3ddc380`。
- 模型：`zhipuai/glm-5.3-flash`，插件侧一次工具调用 0.06–0.09 s；整回合 20–40 s（主要是模型思考）。
- 截图 14 张：01–08 是真机流程，09–12 是重启/空/失败/重试，13–14 是平台自带外壳。

## 如果继续做

按优先级：真实故障注入 → 行级权限与同租户多组织 → `seed_tickets` 收进初始化 → 批量提议（逐条确认）→ 退回理由回灌。

## 一句话自评

做得最好的是"人在回路"这条线：AI 提议、人签字、重试不重复建单，三层都有证据，而且是在平台自带入口里验的。最弱的是环境侧——Windows 宿主打了 5 处补丁才跑起来，换台机器不是一键能复现的，这条我写在已知限制第 2 条，没有绕过。
