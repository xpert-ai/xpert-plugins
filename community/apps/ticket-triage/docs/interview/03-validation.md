# 03 · 验证记录（面试官阅读版）

> **30 秒版**：四层测试分别做了、都被记录，而且每层都写清"这一层证明不了什么"——因为单元测试证明不了真实数据库，harness 证明不了界面，视图接口证明不了浏览器点击。第四层真的在平台里跑了一遍：真实模型调两个工具 → 人在看板点确认 → 重启后数据还在。另外补了跨租户隔离实测与平台自带外壳（截图 13/14）。
>
> **看这一份能判断**：验证是真做的还是摆的（每层都有命令、结果、边界）、发现问题的能力（`team` 参数被适配层静默丢弃、app-platform 三堵墙）。
> **先看两张表**：第 1 节四层结果、第 2 节五个验收场景。

记录时间：2026-11-03（接口层）/ 2026-11-04（浏览器层、重启恢复、跨租户、平台外壳）。插件 0.1.0，`xpert.plugin.level = tenant`。
环境：Windows 宿主从源码跑 API（Node 20.20.2）；基础设施是 CentOS 7.9 VM 内的 `pgvector/pgvector:pg15` 与 `redis/redis-stack-server`；插件以本地源码部署。
基线：`xpert@3ddc380ca20373f9113a77411090de3c3da75e37`、`xpert-plugins@dfad5423205811b3251628ee9bf59a79a4bcbd87`（均 `--depth 1` 取 main，未叠加他人改动；宿主侧 Windows 补丁不随 PR 提交，见附录）。

---

## 1. 四层结果

| 层次 | 命令 / 入口 | 结果 | 这一层证明不了什么 |
| --- | --- | --- | --- |
| 一、业务逻辑 | `corepack pnpm run typecheck`、`corepack pnpm run test`（`tsx --test tests/domain.test.ts`） | 类型检查通过；**11/11**（8.6 s） | 内存 Fake 仓库模拟唯一约束与乐观锁，不覆盖真实 SQL 方言 |
| 二、插件加载 | `node plugin-dev-harness/dist/index.js --workspace ./community --plugin @community/apps-ticket-triage` | `Plugin loaded successfully.` | harness 默认 mock DB 与运行能力，不证明真实数据库与权限 |
| 二、加载（真实平台） | `plugin:deploy:local --scope tenant` → 重启 API → `POST /api/plugin/by-names` | `refreshed and staged successfully`；descriptor `meta` 完整（0.1.0 / tenant / `ticket_triage` / 三种 types / capability `ticket_triage.board`） | 不证明视图在浏览器里渲染正确 |
| 三、界面集成 | `GET /api/view-hosts/agent/<id>/slots/agent.workbench.main/views`、`.../data`、`.../actions/<key>`；并用浏览器真点 | 槽位返回 `ticket_triage.board__ticket_triage.board-view`；`data` 200；`seed/confirm/reject/reset` 全部 201；浏览器里点「确认分诊」「重试分诊」均走通（截图 06/07/11/12） | 平台自带外壳另用 `?view=` 验证（截图 13/14，前置条件见第 5 节第 1 条） |
| 四、平台业务流程 | `POST /api/xpert-template/<id>/install` → `POST /api/chat` → 视图动作 | 模板安装成功；真实模型调用触发两个工具；人工确认后关闭；重启后数据仍在 | 见第 5 节"已知边界" |
| 附：权限与多租户 | 另建第二租户，用主租户 `xpertId` 打视图/对话/模板 | 工作区 `total=0`；视图 **404 `Not found xpert '…' in current tenant`**；对话 SSE `The requested record was not found`；模板列表无本插件 | 未覆盖"同租户两组织" |

**关于 lint**：本包 `package.json` 只有 `typecheck` / `build` / `test` / `verify:dist` / `check`，**没有 lint 脚本**（`community/apps` 下 dockyard 等同样没有）。按题面 [117]"存在 lint、typecheck 或界面测试脚本时一并执行"的口径，执行的是 typecheck + 领域测试 + 构建与产物校验；仓库级检查也跑了：`check:entity-names` → `All community entity names start with "plugin_".`，`check:plugin-metadata` → `Plugin metadata check passed (working-tree, 0 plugins).`

## 2. 表 2 五个验收场景 → 证据

| 场景 | 操作（可复现） | 通过标准 | 证据 |
| --- | --- | --- | --- |
| 完整业务流程 | 预览里要求"列出待处理工单并对某张提建议" → 看板点确认 | 界面、业务状态、保存结果一致 | 截图 05/06/07；`evidence.json` 的 `browserRun` |
| 保存与恢复 | 重启 API 后重新打开看板 | 记录与修订号逐条一致 | 截图 09（`全部 4 / 待处理 2 / 已确认 2`，T-1002 rev3、T-1004 rev4）；`capture-board.mjs --stage persisted` |
| 输入与空状态 | 清空该助手工单后打开看板 | 有明确提示与下一步入口 | 截图 10（`全部 0` + "还没有工单。点『载入演示工单』开始。"）；`--stage empty` |
| 失败与重试 | 把一张工单标成失败 → 点「重试分诊」 | 呈现可理解原因，重试不重复产生业务结果 | 截图 11（`需重试 1`、尝试次数 1、`model_timeout`）、12（回到 `待处理 4`，尝试次数保留，仍 4 行）；`--stage failed` / `--stage retry` |
| 权限与数据范围 | 第二租户用主租户 `xpertId` 打三类接口 | 无权限不能读改他人数据 | 四级实测见第 1 节最后一行；单元测试另有跨 tenantId 用例 |

造 `empty`/`failed` 的 SQL 与前置条件在 [tests/browser/README.md](../../tests/browser/README.md)。

## 3. 第四层实测轨迹（两条路都走通）

**A. 对话接口驱动** — 助手由模板创建：xpert `7d8dc9bc-4324-4ce1-8719-7674ae566e22`，工作区 `Support Ops`，模型 `zhipuai / glm-5.3-flash`（默认角色 primary）。

1. **AI 处理（T-1001）**：`POST /api/chat` → 模型调 `list_pending_tickets`（4 张）→ 调 `propose_ticket_triage` 写 `P1 / billing` → `proposed`、`revision=2`。
2. **人工确认（T-1001）**：视图动作 `confirm_triage`（`expectedRevision=2`）→ `confirmed`、`revision=3`。**这是唯一能关闭工单的路径**。
3. **被退回（T-1003）**：第二次对话提建议 `P1 / logistics`（`revision=2`）；人执行 `reject_triage`（理由"应转客服成功团队"）→ 回 `pending`、`revision=3`，`priority/team/rationale/draftReply` 清空，`reviewNote` 留退回理由。
4. **重试（T-1003）**：第三次对话重提 → `proposed`、`revision=4`；确认时把组覆盖为 `customer_success` → `confirmed`、`revision=5`。
5. **重试不产生重复业务结果**：全程 `plugin_ticket_triage_ticket` 始终 4 行；`seed_tickets` 重复执行不新增（幂等）。
6. **保存与恢复**：重启 API 前后 `.../data` 一致：`total=4, pending=2, confirmed=2`。

**B. 浏览器界面驱动（Cloud UI 生产构建 + 真实模型 + 真实点击）** — 同一助手、同一模型：

1. 工作区里能看到应用卡片，助手 `Support ticket triage v1` 已发布（截图 01）。
2. 打开助手是 studio 画布：智能体节点 + 中间件「工单分诊」+ 两个工具（截图 02、08）。
3. 右侧「预览」是真实对话面板（截图 03、04）。
4. 模型先渲染工单表格（`list_pending_tickets` 0.063 s），再提交建议（`propose_ticket_triage` 0.077 s），给出 P1 / product 的判断依据与草稿，末尾写明"等待人工确认"（截图 05）→ 服务端 T-1004 `proposed`、`revision 2→3`。
5. 看板显示"全部 4 / 待处理 2 / 待确认 1 / 已确认 1"，选中 T-1002 可见 AI 的优先级、组、依据、草稿、尝试次数（截图 06）。
6. 点「确认分诊」→ `confirm_triage` 返回 `{"success":true,"data":{"ticketCode":"T-1002","revision":3}}`，看板变"待确认 0 / 已确认 2"，提示"已保存，人工确认后视为完成"（截图 07）。

ID、动作与返回摘要已脱敏摘录进 [evidence.json](evidence.json)。

## 4. 跑真机才发现的集成坑（最有价值的一条）

工具 schema 里字段名叫 `team` 时，托管模型（`glm-5.3-flash`）**每轮都漏掉这个必填字段**，`propose_ticket_triage` 稳定报 `Received tool input did not match expected schema`。给每个字段补 `.describe()` 并重述"REQUIRED"仍然漏。

隔离实验：把同一份 JSON Schema 生成的 parameters 直接 POST 到 `https://open.bigmodel.cn/api/paas/v4/chat/completions`（key 从 DB 的 `copilot_provider.credentials` 读），模型返回的 arguments **包含** `team:"billing"` → 说明 Schema 没问题，**丢失发生在平台的模型适配层**。把参数改名为 `owningTeam` 后立刻稳定通过。

结论已写进代码注释与 [06-gaps-and-pr.md](06-gaps-and-pr.md) 第 9 条：工具参数别用 `team` 这类容易与平台自身概念冲突的短词；这类问题**不能靠手写 JSON 示例来测**，必须真让模型跑一次看它交上来的 arguments。

## 5. 已知边界（按"影响不影响演示"分级）

**不影响演示、但需要知道：**

1. **平台自带工作台外壳已跑通，但依赖会员子系统**。配好 `APP_PLATFORM_FILE` / `APP_PLATFORM_ENVIRONMENT_FILE` 后 `GET /api/app-platform/me` 从 400 `app_platform_not_configured` 变成 `mode: managed-apps`；接着 provisioning 依次撞三堵墙，都补齐才 `ready:true`：
   - `APP_PLATFORM_FAILURE:application_trial_unavailable` —— `platform-provisioner.service.ts:57` 要 `ensureTenantDefaultMembership()`：需要 `FEATURE_MEMBERSHIP_PLAN`（`membership-policy.service.ts:166`）、`MEMBERSHIP_USE`（`membership-utils.ts:147`）与一条默认 `membership_plan`。seed 库里计划与 `user_membership` 都是 0 行，补 1 条 `code='default', "isDefault"=true, "allowedModels"='[]'` 后自动生成试用记录。
   - `application_model_binding_unavailable` —— `platform-models.service.ts` 只认 `copilot.role='primary'`，seed 出来的 copilot `role` 是空串；补上后又因 provisioner 在 BullMQ 上下文里解析 provider 得到 `undefined`（`[app-platform][debug] no manager for provider=zhipuai type=llm providerResolved=false`），需把 `captureRequestContext(...)` 提到 `models.resolve(...)` 之前并用 `runWithCapturedRequestContext` 包住。**这条是宿主侧真实缺陷，不是配置问题**。
   - `application_preparation_failed` —— 栈在 `XpertWorkspaceAccessService.assertCan` → `PluginTemplateInstallHandler.execute`：平台自己的 provisioning actor（`app-platform-<deliveryId>@internal.invalid`）只有 2 条权限，需补到常规 57 条。
   补齐后入口 `/chat/x/community-apps-ticket-triage-studio-<orgId>/c?view=ticket_triage.board__ticket_triage.board-view` 正常渲染（截图 13/14）。**注意**：进入 managed-apps 模式后 `/chat` 只对 app-platform 发布的资源开放，之前手装的助手会"不可见"，这是 `applyAppPlatformPublishedFilter` 的预期行为。
2. **06/07 的外壳是替身**：这两张截于 managed-apps 打通之前，用的是按文档化协议实现的最小宿主（握手 → `requestData` → `executeAction`，全打到真实 `view-hosts`）。组件、数据、动作都是插件的，只有外壳是替代；宿主本身提交在 `tests/browser/host.html` + `serve-host.mjs`，没 app platform 的机器也能复现。
3. **`--no-mocks` 没单独跑**：只跑了 harness 默认 mock 模式；真实数据库路径由第 3 节 A 的真实部署与业务流覆盖。
4. **只在 Windows 宿主 + Linux 容器基础设施上验证**：宿主侧为跑通改了若干上游文件（见附录），这些**不进 PR**，意味着"别的机器一键跑通"尚未被证明。
5. **模型选择受限**：智谱插件 `validateCredentials` 固定 `thinking: disabled` 试调，`glm-5.3-flash` 因"始终思考"过不了平台校验，是加进 `copilot_provider.options.enabledModels` 后由内置 yaml 提供元数据的；更便宜的 `glm-4.5-flash` 校验通过但一次工具调用约 16 s。

**影响"证据强度"、必须说清楚的：**

6. **界面里的失败是模拟的**：截图 11/12 那张"需重试"是用 SQL 标 `failed` + `lastErrorCode=model_timeout` 造的，随后真点「重试分诊」→ 回 `pending`、尝试次数保留、表里仍 4 行。它证明"失败态可读、可重试、不重复建单"，不是真实模型超时；真故障注入要打断模型网关，没做。同理截图 13 里"待确认"那张也是 SQL 置的（当时本机代理把模型域名解析到 `198.18.0.48`，模型调不通），**但"确认"那一下是真点的**（真实 `executeAction` → 201）。"真实模型产出建议"由截图 03/04/05 与 `evidence.json.browserRun` 覆盖，两者不要混看。
7. **租户隔离**：已验跨租户（第 1 节最后一行）；未验同租户两组织。
8. `workspaceId` / `userId` 保留在表结构但不再参与归属键（团队共享看板），按用户隔离需重新引入并同步两侧 scope 计算。

## 6. 截图索引（14 张，全部随代码提交）

| 要证明 | 截图 |
| --- | --- |
| 插件在 Xpert 中运行、版本正确 | [01](screenshots/01-workspace-assistant.png) |
| 模板带来中间件与工具 | [02](screenshots/02-agent-canvas.png)、[08](screenshots/08-middleware-capabilities.png) |
| AI 处理结果真实 | [03](screenshots/03-preview-composer.png)、[04](screenshots/04-preview-prompt.png)、[05](screenshots/05-chat-tool-calls.png) |
| 人工确认 | [06](screenshots/06-board-awaiting-human.png)、[07](screenshots/07-board-confirmed.png)（替身宿主）；[13](screenshots/13-platform-shell-board.png)、[14](screenshots/14-platform-shell-confirmed.png)（平台自带外壳） |
| 保存与恢复 | [09](screenshots/09-board-persisted-after-restart.png) |
| 输入与空状态 | [10](screenshots/10-board-empty-state.png) |
| 失败与重试 | [11](screenshots/11-board-needs-retry.png)、[12](screenshots/12-board-retry-recovered.png) |

全部由 `tests/browser/capture-chat.mjs` 与 `capture-board.mjs` 生成，可重跑。

## 7. 题面的"最小完整示例"（[83]–[91]）：招聘方没给，我自己走了一遍

题面 [83] 要求招聘方在出题前给一个已验证的"提交内容 → AI 处理 → 人工确认 → 保存结果"示例，地址一栏写明 `【招聘方发出题目前补齐】`——本仓库拿到的版本里这一栏是空的，[91] 也明说"源码目录与 Skills 不能替代这一经过验证的完整示例"。于是我把 [85]–[90] 当清单自己走：

| 题面步骤 | 实际操作 | 证据 |
| --- | --- | --- |
| [85] 安装插件 | `plugin:deploy:local --scope tenant`（先 build + verify:dist + test）→ `installed and staged successfully` | 第 1 节第二行第二例 |
| [86] 重启并验证加载 | 重启 API → `Plugin installation committed`；`POST /api/plugin/by-names` 返回完整 descriptor | 同上 |
| [87] 展示助手模板 | `GET /api/xpert-template` 第一条即本插件模板（`source: plugin`） | 截图 02/08 |
| [88] 基于模板建助手 | `POST /api/xpert-template/<encoded-id>/install {workspaceId, publish:true}` → xpert `7d8dc9bc-…` | 截图 01 |
| [89] 绑定工具与工作台 | 模板 DSL 自带中间件（两工具）与 `viewProvider`，安装即绑定 | 截图 02/08 |
| [90] 真实调用 + 人工确认 + 保存 | glm-5.3-flash 两轮工具调用 → 看板点确认 201 → 重启后仍在 | 截图 05/13/14/09 |

这也解释了 [06-gaps-and-pr.md](06-gaps-and-pr.md) 里为什么把"缺少已验证示例"列为对题面的建议：**没有示例，候选人只能靠读源码反推宿主行为**，我这次踩的坑（`team` 被静默丢弃、app-platform 三堵墙）本来都能被一份示例提前暴露。

## 附录 · 本机宿主补丁（不进 PR，只为复现）

宿主仓库 `xpert-ai/xpert` 需要五处补丁才能在这台 Windows 机器上构建运行：

1. `packages/server/tsconfig.lib.json` 的 `exclude` 加 `"**/*.fixture.ts"`（否则 `TS2742`，与 `@redis/time-series` 类型推断有关）。
2. `packages/server/src/plugin/plugin-loader.ts`：动态 import 改 `new Function('s','return import(s)')`（TS 会把 `import()` 降级成 `require`，`file:///C:/...` 必然找不到）。
3. 四处 `build.mjs` 在 win32 下用 `cmd /c` 调 `tailwindcss` / `npm`（无扩展名 POSIX shim 与 `.cmd` 都不能无 shell spawn）。
4. `packages/plugin-sdk/src/lib/ai-model/ai-model-provider.decorator.ts`：`file:///C:/...` 剥前缀后再删多余前导 `/`，否则 provider 的 YAML schema 定位失败，报 `This provider has no credential schema.`
5. `packages/server-ai/src/plugin-resource/app-platform/platform-provisioner.service.ts`：把 `captureRequestContext(...)` 提到 `models.resolve()` 之前（见第 5 节第 1 条第二堵墙）。

复现：按 [02-runbook.md](02-runbook.md) 起 API 与 Cloud UI → 工作区 → 助手 → 预览，发"列出待处理工单并给某张提建议" → 工作台视图里点确认。本轮用生产构建（`nx build cloud --configuration=production`，并把 `dist` 里 `DOCKER_API_BASE_URL` 等占位符改成本机值），因为 Windows 上 `nx serve cloud` 的 vite 预打包会把 `XpAuthStrategy` 解析成 undefined。
