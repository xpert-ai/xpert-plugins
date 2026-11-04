# 验证记录（四层）

记录时间：2026-11-03。插件版本 `@community/apps-ticket-triage` 0.1.0，`xpert.plugin.level = tenant`。
运行环境：Windows 宿主从源码运行 Xpert API（Node 20.20.2，`xpert-ai/xpert` main @ `3ddc380`），基础设施是 CentOS 7.9 虚拟机里的 Docker 容器 `pgvector/pgvector:pg15` 与 `redis/redis-stack-server`；插件从 `xpert-ai/xpert-plugins` main @ `dfad542` 的 `community/apps/ticket-triage` 以本地源码部署。

四层结果不能互相替代：单元测试证明不了真实数据库，生命周期 harness 证明不了界面，视图 HTTP 接口证明不了浏览器点击。

| 层次 | 实际执行的命令 / 入口 | 结果 | 这一层证明不了什么 |
| --- | --- | --- | --- |
| 一、业务逻辑 | `corepack pnpm run typecheck` 与 `corepack pnpm run test`（`tsx --test tests/domain.test.ts`） | 类型检查通过；**11/11 用例通过**（8.6 s） | 用的是内存 Fake 仓库，模拟唯一约束与乐观锁，不覆盖真实 SQL 方言 |
| 二、插件加载 | `node plugin-dev-harness/dist/index.js --workspace ./community --plugin @community/apps-ticket-triage` | `Plugin loaded successfully.` | harness 默认启用 mock DB 与运行能力，不证明真实数据库和权限 |
| 二、插件加载（真实平台） | `corepack pnpm plugin:deploy:local ... --scope tenant` → 重启 API → `POST /api/plugin/by-names` | `refreshed and staged successfully`；descriptor 的 `meta` 完整（version 0.1.0、level tenant、artifactNamespace `ticket_triage`、types `business-app/assistant-template/workbench-view`、capabilities `ticket_triage.board`） | 不证明视图在浏览器里渲染正确 |
| 三、界面集成 | `GET /api/view-hosts/agent/<xpertId>/slots/agent.workbench.main/views`、`.../data`、`.../actions/<actionKey>`；并用浏览器在真实界面里点确认 | 槽位返回视图 key `ticket_triage.board__ticket_triage.board-view`；`data` 返回 200；`seed_tickets`、`confirm_triage`、`reject_triage` 均 201；浏览器里点「确认分诊」同样走通（截图 06、07） | 视图宿主 HTTP 接口与浏览器点击都覆盖了，但没有覆盖平台自带工作台外壳本身（见"未覆盖"第一条） |
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

- **平台自带的工作台外壳**：本机没有配置 app platform（`APP_PLATFORM_FILE` / `APP_PLATFORM_ENVIRONMENT_FILE`），`/chat/...` 路由会被 `app-platform.guard` 重定向到 `/apps`，所以截图 06、07 是用一个按文档化 remote component 协议实现的最小宿主渲染插件自己的 iframe 组件（握手 → `requestData` → `executeAction`，全部打到真实 `view-hosts` 接口）。组件、数据、动作都是插件自己的，只有外壳是替代品，这一点在 README 里也写明了。
- **`--no-mocks` 生命周期**：只跑了 harness 默认的 mock 模式；真实数据库连接由第四条的真实部署与业务流覆盖。
- **失败注入**：`reset_ticket`（把 `failed` 打回 `pending`）只有单元测试覆盖，平台层没有制造一次真实的模型失败，因此"失败→重试"我在平台层演示的是"被人工退回→重试"。
- **权限与多租户**：只在单租户单组织下验证；租户隔离由单元测试（跨 tenantId 读不到）覆盖，未在平台层造第二个租户。

## 截图

截图随代码提交在 [screenshots/](screenshots/)，README 里用相对路径引用。

| 需要证明 | 截图 | 状态 |
| --- | --- | --- |
| 插件在 Xpert 中运行、版本正确 | [01-workspace-assistant.png](screenshots/01-workspace-assistant.png) | 已截 |
| 模板带来了中间件与工具 | [02-agent-canvas.png](screenshots/02-agent-canvas.png)、[08-middleware-capabilities.png](screenshots/08-middleware-capabilities.png) | 已截 |
| AI 处理结果真实 | [03-preview-composer.png](screenshots/03-preview-composer.png)、[04-preview-prompt.png](screenshots/04-preview-prompt.png)、[05-chat-tool-calls.png](screenshots/05-chat-tool-calls.png) | 已截 |
| 人工确认 | [06-board-awaiting-human.png](screenshots/06-board-awaiting-human.png)、[07-board-confirmed.png](screenshots/07-board-confirmed.png) | 已截（外壳为替代宿主，见上） |
| 失败与重试 | 退回 → `pending` → 重提 → `revision` 递增、行数不变 | 只有接口与单元测试证据（`evidence.json`），没有对应截图 |
| 保存与恢复 | 重启 API 前后 `.../data` 一致 | 接口证据（`evidence.json`），没有对应截图 |

复现方式：按 [02-runbook.md](02-runbook.md) 起 API 与 Cloud UI，登录后进工作区 → 助手 → 预览，发一条"列出待处理工单并给某张工单提建议"的消息；然后在工作台视图里点确认。本轮用的是生产构建（`nx build cloud --configuration=production`，并把 `dist` 里的 `DOCKER_API_BASE_URL` 等占位符改成本机值），因为 Windows 上 `nx serve cloud` 的 vite 依赖预打包会把 `XpAuthStrategy` 解析成 undefined。

