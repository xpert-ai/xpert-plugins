# 验证记录（四层）

记录时间：2026-11-03（接口层）；2026-11-04（浏览器层与重启恢复）。插件版本 `@community/apps-ticket-triage` 0.1.0，`xpert.plugin.level = tenant`。
基线版本：`xpert-ai/xpert` main @ `3ddc380ca20373f9113a77411090de3c3da75e37`，`xpert-ai/xpert-plugins` main @ `dfad5423205811b3251628ee9bf59a79a4bcbd87`。两个仓库都是 `git clone --depth 1` 取的 main，本地没有再叠加别人的改动（宿主侧为跑通 Windows 环境做的补丁不随 PR 提交，见文末"本机补丁"）。
运行环境：Windows 宿主从源码运行 Xpert API（Node 20.20.2），基础设施是 CentOS 7.9 虚拟机里的 Docker 容器 `pgvector/pgvector:pg15` 与 `redis/redis-stack-server`；插件从上面的插件仓 main 的 `community/apps/ticket-triage` 以本地源码部署。

四层结果不能互相替代：单元测试证明不了真实数据库，生命周期 harness 证明不了界面，视图 HTTP 接口证明不了浏览器点击。

| 层次 | 实际执行的命令 / 入口 | 结果 | 这一层证明不了什么 |
| --- | --- | --- | --- |
| 一、业务逻辑 | `corepack pnpm run typecheck` 与 `corepack pnpm run test`（`tsx --test tests/domain.test.ts`） | 类型检查通过；**11/11 用例通过**（8.6 s） | 用的是内存 Fake 仓库，模拟唯一约束与乐观锁，不覆盖真实 SQL 方言 |
| 二、插件加载 | `node plugin-dev-harness/dist/index.js --workspace ./community --plugin @community/apps-ticket-triage` | `Plugin loaded successfully.` | harness 默认启用 mock DB 与运行能力，不证明真实数据库和权限 |
| 二、插件加载（真实平台） | `corepack pnpm plugin:deploy:local ... --scope tenant` → 重启 API → `POST /api/plugin/by-names` | `refreshed and staged successfully`；descriptor 的 `meta` 完整（version 0.1.0、level tenant、artifactNamespace `ticket_triage`、types `business-app/assistant-template/workbench-view`、capabilities `ticket_triage.board`） | 不证明视图在浏览器里渲染正确 |
| 三、界面集成 | `GET /api/view-hosts/agent/<xpertId>/slots/agent.workbench.main/views`、`.../data`、`.../actions/<actionKey>`；并用浏览器在真实界面里点确认、点重试、看重启后数据（脚本见 `tests/browser/`） | 槽位返回视图 key `ticket_triage.board__ticket_triage.board-view`；`data` 返回 200；`seed_tickets`、`confirm_triage`、`reject_triage`、`reset_ticket` 均 201；浏览器里点「确认分诊」「重试分诊」同样走通（截图 06、07、11、12） | 视图宿主 HTTP 接口与浏览器点击都覆盖了，但没有覆盖平台自带工作台外壳本身（见"未覆盖"第一条） |
| 四、平台业务流程 | `POST /api/xpert-template/<id>/install` → `POST /api/chat` → 视图动作 | 模板安装成功；真实模型调用并触发两个工具；人工确认后工单关闭；重启后数据仍在 | 见下"未覆盖"一节 |

## 四层之四：一次完整业务流程的实测轨迹

两次完整跑通，一次走对话接口（脚本），一次走浏览器界面（下面的截图）：

**A. 对话接口驱动（脚本）** — 助手由模板安装创建：xpert `7d8dc9bc-4324-4ce1-8719-7674ae566e22`，工作区 `Support Ops`，模型 `zhipuai / glm-5.3-flash`（默认角色 primary）。

1. **AI 处理（T-1001）**：`POST /api/chat` 要求先列工单再对 T-1001 提建议。模型调用 `list_pending_tickets`（返回 4 张待处理工单）后调用 `propose_ticket_triage`，写入 `P1 / billing`，工单变为 `proposed`、`revision=2`。
2. **人工确认（T-1001）**：视图动作 `confirm_triage`（`expectedRevision=2`，备注"客服主管已复核"）→ `confirmed`、`revision=3`。这是唯一会关闭工单的路径。
3. **被退回（T-1003）**：第二次对话对 T-1003 提建议 `P1 / logistics`、`revision=2`；人工执行 `reject_triage`（理由"应转客服成功团队"）→ 回到 `pending`、`revision=3`，`priority`/`team`/`rationale`/`draftReply` 全部清空，`reviewNote` 保留退回理由。
4. **重试（T-1003）**：第三次对话重新提建议 → `proposed`、`revision=4`；人工确认时把归属团队覆盖为 `customer_success` → `confirmed`、`revision=5`。
5. **重试不产生重复业务结果**：整个过程 `plugin_ticket_triage_ticket` 始终只有 4 行；`seed_tickets` 重复执行也不新增行（幂等）。
6. **保存与恢复**：重启 API 前后再次读取 `.../data`，结果一致：`total=4, pending=2, confirmed=2`，T-1001 `revision=3`、T-1003 `revision=5`。

**B. 浏览器界面驱动（Cloud UI 生产构建 + 真实模型 + 真实点击）** — 2026-11-04，同一助手、同一模型：

1. 工作区「Support Ops」里能看到插件的应用卡片，助手 `Support ticket triage v1` 已发布（截图 01）。
2. 打开助手是 studio 画布：智能体节点 + 中间件「工单分诊」+ 两个工具 + 100%（截图 02、08）。
3. 右侧「预览」是真实对话面板；输入"请列出待处理工单，然后只对 T-1004 提交分诊建议：priority=P1、team=product"（截图 03、04）。
4. 模型先渲染出工单表格（`list_pending_tickets`，0.063 s），再提交建议 `propose_ticket_triage`（0.077 s），并给出 P1 / product 的判断依据与回复草稿，末尾明确"等待人工确认"（截图 05）。服务端写入：T-1004 `proposed`、`revision 2 → 3`。
5. 打开工作台视图，看板显示"全部 4 / 待处理 2 / 待确认 1 / 已确认 1"，选中 T-1002 能看到 AI 的优先级、承接团队、判断依据、回复草稿与尝试次数（截图 06）。
6. 点「确认分诊」，执行的是同一套乐观锁动作：`confirm_triage` 返回 `{"success":true,"data":{"ticketCode":"T-1002","revision":3}}`，看板变为"待确认 0 / 已确认 2"，并提示"已保存，人工确认后视为完成"（截图 07）。

上面的 ID、动作与返回摘要已脱敏后摘录进 [evidence.json](evidence.json)。

## 跑真机才发现的一个集成坑（写进这里，因为它就是"AI 处理"这一层的真实风险）

工具 schema 里字段名叫 `team` 时，托管模型（`glm-5.3-flash`）**每次都漏掉这个必填字段**，`propose_ticket_triage` 稳定报 `Received tool input did not match expected schema`；同一份 JSON Schema 直接打模型 API 时字段是全的，说明丢失发生在模型适配层而不是模型本身。把字段改名为 `owningTeam`（并在 `describe()` 里再写一遍"REQUIRED，取值是这五个"）之后立刻恢复正常，两次运行都成功。

结论写进代码注释与 [06-gaps-and-pr.md](06-gaps-and-pr.md)：**工具参数名不要用 `team` 这类容易与平台自身概念冲突的短词**；同时说明这层校验为什么不能只靠手写 JSON 示例来测——必须真的让模型跑一次，看它交上来的 arguments。

## 未覆盖与已知边界

- **平台自带的工作台外壳**：这一条我试过配通，结论是它在开源版里不是"配两个文件"就能开的。先按 `packages/contracts/src/app-platform.ts` 的 schema 写了一份 definition + environment（一个 app、`primary` 指向 `zhipuai/glm-5.3-flash`），设好 `APP_PLATFORM_FILE` / `APP_PLATFORM_ENVIRONMENT_FILE` 后重启：`GET /api/app-platform/me` 从 400 `app_platform_not_configured` 变成 `mode: managed-apps`，但 provisioning 的 BullMQ 任务（`bull:app-platform-delivery`）以 `APP_PLATFORM_FAILURE:application_trial_unavailable` 失败——根因在 `packages/server-ai/src/plugin-resource/app-platform/platform-provisioner.service.ts:57`：它先要求 `ensureTenantDefaultMembership()` 返回一个会员记录，而这条路要求会员计划（`membership_plan`）与试用策略先存在；这台机器 seed 出来的库里 `membership_plan` 与 `user_membership` 都是 **0 行**。也就是说托管式应用外壳（`/apps` 壳 + `/chat/...` workbench）依赖付费/试用会员子系统，需要额外的 plan、权限与试用配置才能拉起，不是插件侧能补齐的。所以配置被撤回（`mode: standard`），截图 06、07 改用一个按文档化 remote component 协议实现的最小宿主渲染插件自己的 iframe 组件（握手 → `requestData` → `executeAction`，全部打到真实 `view-hosts` 接口）。组件、数据、动作都是插件自己的，只有外壳是替代品，这一点在 README 里也写明了。
- **`--no-mocks` 生命周期**：只跑了 harness 默认的 mock 模式；真实数据库连接由第四条的真实部署与业务流覆盖。
- **失败注入的方式**：界面证据（截图 11、12）里的"分诊失败"是用 SQL 把一张工单标成 `failed`、`lastErrorCode=model_timeout` 造出来的**模拟失败**，随后在看板上点「重试分诊」回到 `pending`。我没有在平台层制造一次真实的模型超时（那需要打断模型网关），所以这一条展示的是"失败状态 → 可理解的原因 → 重试不重复建单"的链路，而不是真实故障注入。被人工退回再重提的路径则由接口与截图 06/07 覆盖。
- **权限与多租户**：只在单租户单组织下验证；租户隔离由单元测试（跨 tenantId 读不到）覆盖，未在平台层造第二个租户。

## 表 2 五个验收场景的对应证据

| 场景 | 平台操作（可复现） | 通过标准 | 证据 |
| --- | --- | --- | --- |
| 完整业务流程 | 预览里要求"列出待处理工单并对某张提建议" → 看板点确认 | 界面、业务状态与保存结果一致 | 截图 05、06、07；`evidence.json` 的 `browserRun` |
| 保存与恢复 | 重启 API 后重新打开看板 | 记录与修订号逐条一致 | 截图 09（`全部 4 / 待处理 2 / 待确认 0 / 已确认 2`，T-1002 rev3、T-1004 rev4）；脚本 `tests/browser/capture-board.mjs --stage persisted` |
| 输入与空状态 | 清空该助手工单后打开看板 | 有明确提示与下一步入口 | 截图 10（`全部 0`，"还没有工单。点『载入演示工单』开始。"）；`--stage empty` |
| 失败与重试 | 把一张工单标成失败 → 看板上点「重试分诊」 | 呈现可理解原因，重试不重复产生业务结果 | 截图 11（`需重试 1`、尝试次数 1、失败原因 `model_timeout`、按钮「重试分诊」）、12（回到 `待处理 4`，尝试次数保留，行数仍为 4）；`--stage failed` / `--stage retry` |
| 权限与数据范围 | 单元测试里跨租户读取 | 无权限不能读改他人数据 | `tests/domain.test.ts` 的跨租户隔离用例；平台层未造第二租户（见"未覆盖"） |

造 `empty` / `failed` 两个状态用的 SQL 与前置条件写在 [tests/browser/README.md](../../tests/browser/README.md) 里。

## 截图

截图随代码提交在 [screenshots/](screenshots/)，README 里用相对路径引用。

| 需要证明 | 截图 | 状态 |
| --- | --- | --- |
| 插件在 Xpert 中运行、版本正确 | [01-workspace-assistant.png](screenshots/01-workspace-assistant.png) | 已截 |
| 模板带来了中间件与工具 | [02-agent-canvas.png](screenshots/02-agent-canvas.png)、[08-middleware-capabilities.png](screenshots/08-middleware-capabilities.png) | 已截 |
| AI 处理结果真实 | [03-preview-composer.png](screenshots/03-preview-composer.png)、[04-preview-prompt.png](screenshots/04-preview-prompt.png)、[05-chat-tool-calls.png](screenshots/05-chat-tool-calls.png) | 已截 |
| 人工确认 | [06-board-awaiting-human.png](screenshots/06-board-awaiting-human.png)、[07-board-confirmed.png](screenshots/07-board-confirmed.png) | 已截（外壳为替代宿主，见上） |
| 保存与恢复 | [09-board-persisted-after-restart.png](screenshots/09-board-persisted-after-restart.png) | 已截（重启 API 之后） |
| 输入与空状态 | [10-board-empty-state.png](screenshots/10-board-empty-state.png) | 已截 |
| 失败与重试 | [11-board-needs-retry.png](screenshots/11-board-needs-retry.png)、[12-board-retry-recovered.png](screenshots/12-board-retry-recovered.png) | 已截（失败为 SQL 模拟，见"未覆盖"） |

全部截图由 `tests/browser/capture-chat.mjs` 与 `tests/browser/capture-board.mjs` 生成，可重跑。

## 本机补丁（不进 PR，仅说明宿主如何在这台机器上跑起来）

宿主仓库 `xpert-ai/xpert` 在本机需要四处 Windows 兼容补丁才能构建与运行，**这些改动不提交**，仅记录在此以便复现：

1. `packages/server/tsconfig.lib.json` 的 `exclude` 增加 `"**/*.fixture.ts"`（否则 `TS2742`，与 redis time-series 类型推断有关）。
2. `packages/server/src/plugin/plugin-loader.ts`：动态 import 改为 `new Function('s', 'return import(s)')`（TS 会把 `import()` 降级成 `require`，`file:///C:/...` 必然找不到）。
3. 四处 `build.mjs` 在 win32 下用 `cmd /c` 调 `tailwindcss` / `npm`（无扩展名的 POSIX shim 与 `.cmd` 都不能无 shell spawn）。
4. `packages/plugin-sdk/src/lib/ai-model/ai-model-provider.decorator.ts`：`file:///C:/...` 剥前缀后要再删掉多余的 `/`，否则 provider 的 YAML schema 定位失败，报 `This provider has no credential schema.`。

复现方式：按 [02-runbook.md](02-runbook.md) 起 API 与 Cloud UI，登录后进工作区 → 助手 → 预览，发一条"列出待处理工单并给某张工单提建议"的消息；然后在工作台视图里点确认。本轮用的是生产构建（`nx build cloud --configuration=production`，并把 `dist` 里的 `DOCKER_API_BASE_URL` 等占位符改成本机值），因为 Windows 上 `nx serve cloud` 的 vite 依赖预打包会把 `XpAuthStrategy` 解析成 undefined。

