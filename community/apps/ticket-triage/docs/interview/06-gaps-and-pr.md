# 已知限制与待提交 PR

## 提交形态

- 目标仓库：`xpert-ai/xpert-plugins`，基线上游 `main` @ `dfad5423205811b3251628ee9bf59a79a4bcbd87`。
- 分支：`feat/ticket-triage-app`，只新增 `community/apps/ticket-triage/`（源码、`dist` 外的一切、文档）。
- 不改动仓库里的公共包、`pnpm-workspace.yaml`、其他 app；`community/.changeset/` 里没有为本插件追加 changeset，因为 community 应用的既有提交（如 dockyard）也没有单独的 changeset 文件，需要的话可以按维护者要求补一条。
- 提交前应执行的检查：`corepack pnpm run typecheck`、`corepack pnpm run test`、`corepack pnpm run build`、`corepack pnpm run verify:dist`。

## 已知限制

1. **平台自带工作台外壳已经跑通，但依赖会员子系统**。按 schema 配好 `APP_PLATFORM_FILE` / `APP_PLATFORM_ENVIRONMENT_FILE`（`/api/app-platform/me` → `mode: managed-apps`）之后，provisioning 依次卡在 `application_trial_unavailable`（缺 `FEATURE_MEMBERSHIP_PLAN` 特性 + `membership_plan` 默认计划）、`application_model_binding_unavailable`（`copilot.role` 为空、且 provisioner 在 BullMQ 上下文里取不到 provider —— 需要把请求上下文提前到 `models.resolve()` 之前）、`application_preparation_failed`（平台自己的 provisioning actor 只有 2 条权限）。补齐后 `ready:true`，`/chat/x/community-apps-ticket-triage-studio-<orgId>/c?view=ticket_triage.board__ticket_triage.board-view` 里能看到 `工单分诊` tab（截图 13、14）。所以这条不是"外壳不可用"，而是"**托管外壳需要会员计划与 provisioning actor 权限，seed 默认数据不提供**"；换环境时按 [03-validation.md](03-validation.md#未覆盖与已知边界) 里那三步补数据即可。没有 app platform 的机器上仍可用替身宿主复现 06/07。
2. **只在 Windows 宿主 + Linux 容器基础设施的组合上验证**。宿主侧为了让平台在 Windows 上跑起来改动了若干上游文件（进程 spawn 的 `.cmd` 调用、目录 fsync、插件动态 import、插件声明目录推断、app-platform provisioner 的请求上下文），这些改动**不进本 PR**，但意味着"别的机器上一键跑通"还没有被证明。
3. **`--no-mocks` 生命周期没有单独跑**。默认 harness 用 mock 的 TypeORM/运行能力；真实数据库路径由真实部署 + 对话流程覆盖。
4. **失败状态是造出来的，不是真实故障**。界面证据（截图 11、12）里那张"需重试"的工单，是用 SQL 把它标成 `failed` + `lastErrorCode=model_timeout` 得到的，随后在看板上点「重试分诊」回到待处理、尝试次数保留、表里仍是 4 行。所以它证明的是"失败状态可读、可重试、重试不重复建单"这条链路，而不是真实模型超时下的行为；真实故障注入需要打断模型网关，没有做。同理，截图 13 里那张待确认工单也是 SQL 置成 `proposed` 的（截图当时本机代理把模型域名解析到 fake-IP，模型调不通），**只有"确认"那一下是真点的**。
5. **租户隔离已在平台层验证**：另建 `Second Tenant`/`Second Company`/`admin@second.test`，用主租户 `xpertId` 打视图数据 → `404 Not found xpert … in current tenant`，对话 → `The requested record was not found`，模板列表只有全局插件、没有本插件。仍未覆盖的是"同租户内两个组织"的隔离。
6. **模型选择受限**。智谱插件自带的 `validateCredentials` 固定用 `thinking: disabled` 试调，`glm-5.3-flash` 因"始终思考"无法通过平台的模型校验；演示用 `glm-5.3-flash` 是把它加进 `copilot_provider.options.enabledModels` 后由平台内置 yaml 提供元数据。更便宜的 `glm-4.5-flash` 校验通过但一次工具调用约 16 s。
7. **`workspaceId`/`userId` 保留在表结构里但不再参与归属键**。看板按 `tenantId + organizationId + xpertId` 归属（团队共享看板），两列写空字符串以兼容既有 DDL；如果要按用户隔离看板，需要重新引入并同步修改视图与智能体两侧的 scope 计算。
8. **`seed_tickets` 是演示用的写操作**，暴露在工具栏动作里；生产形态应该收到初始化流程中，或加开关。
9. **工具参数名踩过平台的坑**。字段名用 `team` 时托管模型每轮都漏掉该必填参数（`Received tool input did not match expected schema`），而同一份 JSON Schema 直接打模型 API 是完整的；改名 `owningTeam` 后立刻正常。这属于模型适配层的隐含约束，已写进代码注释与 [03-validation.md](03-validation.md)，但换模型/换平台版本时需要重新验证一遍。

## 后续可做

- 真实故障注入（打断模型网关，或让 provider 返回 5xx），把截图 11/12 换成真实故障证据。
- 在同租户里再建一个组织，验证组织级隔离（当前只验了跨租户）。
- 让 `propose_ticket_triage` 支持批量（目前故意一张一张提，避免模型一次改多张难以复核）。
- 把"退回理由"回灌到下一次提议的上下文里，减少重复犯同样的归属判断错误。
- 加一个 `expire` 规则：`proposed` 超过 N 小时自动回 `pending`，避免看板积压。
