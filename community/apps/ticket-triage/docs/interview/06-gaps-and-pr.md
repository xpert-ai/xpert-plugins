# 已知限制与待提交 PR

## 提交形态

- 目标仓库：`xpert-ai/xpert-plugins`，基线上游 `main` @ `dfad5423205811b3251628ee9bf59a79a4bcbd87`。
- 分支：`feat/ticket-triage-app`，只新增 `community/apps/ticket-triage/`（源码、`dist` 外的一切、文档）。
- 不改动仓库里的公共包、`pnpm-workspace.yaml`、其他 app；`community/.changeset/` 里没有为本插件追加 changeset，因为 community 应用的既有提交（如 dockyard）也没有单独的 changeset 文件，需要的话可以按维护者要求补一条。
- 提交前应执行的检查：`corepack pnpm run typecheck`、`corepack pnpm run test`、`corepack pnpm run build`、`corepack pnpm run verify:dist`。

## 已知限制

1. **工作台外壳不是平台自带的那个**。平台自带工作台（`/chat/...`）走托管式应用外壳，我按 schema 配了 app platform 的两个 YAML 并重启验证：`/api/app-platform/me` 变成 `mode: managed-apps`，但 provisioning 以 `APP_PLATFORM_FAILURE:application_trial_unavailable` 失败——它要求先有会员计划（`membership_plan` 与 `user_membership` 在当前 seed 出来的库里都是 0 行）。这条链路属于付费/试用会员子系统，不是插件侧能补齐的，所以配置已撤回。看板截图改用一个按文档化 remote component 协议实现的最小宿主渲染插件自己的 iframe 组件（`requestData` / `executeAction` 全部打到真实 `view-hosts` 接口）。组件、数据、动作都是插件自己的，只有外壳是替代品；在配了会员计划的托管环境里应当换成真实外壳再复验一次（细节见 [03-validation.md](03-validation.md#未覆盖与已知边界)）。
2. **只在 Windows 宿主 + Linux 容器基础设施的组合上验证**。宿主侧为了让平台在 Windows 上跑起来改动了若干上游文件（进程 spawn 的 `.cmd` 调用、目录 fsync、插件动态 import、插件声明目录推断），这些改动**不进本 PR**，但意味着"别的机器上一键跑通"还没有被证明。
3. **`--no-mocks` 生命周期没有单独跑**。默认 harness 用 mock 的 TypeORM/运行能力；真实数据库路径由真实部署 + 对话流程覆盖。
4. **失败注入只到单元层**。平台层演示的是"人工退回 → 重试"，`failed` 状态（`markFailed`）与 `reset_ticket` 只有单元测试覆盖。
5. **单租户单组织**。租户隔离由单元测试覆盖，未在平台层建第二个租户验证。
6. **模型选择受限**。智谱插件自带的 `validateCredentials` 固定用 `thinking: disabled` 试调，`glm-5.3-flash` 因"始终思考"无法通过平台的模型校验；演示用 `glm-5.3-flash` 是把它加进 `copilot_provider.options.enabledModels` 后由平台内置 yaml 提供元数据。更便宜的 `glm-4.5-flash` 校验通过但一次工具调用约 16 s。
7. **`workspaceId`/`userId` 保留在表结构里但不再参与归属键**。看板按 `tenantId + organizationId + xpertId` 归属（团队共享看板），两列写空字符串以兼容既有 DDL；如果要按用户隔离看板，需要重新引入并同步修改视图与智能体两侧的 scope 计算。
8. **`seed_tickets` 是演示用的写操作**，暴露在工具栏动作里；生产形态应该收到初始化流程中，或加开关。
9. **工具参数名踩过平台的坑**。字段名用 `team` 时托管模型每轮都漏掉该必填参数（`Received tool input did not match expected schema`），而同一份 JSON Schema 直接打模型 API 是完整的；改名 `owningTeam` 后立刻正常。这属于模型适配层的隐含约束，已写进代码注释与 [03-validation.md](03-validation.md)，但换模型/换平台版本时需要重新验证一遍。

## 后续可做

- 在配置了 app platform 的环境里，用平台自带工作台把看板截图重拍一遍（替换当前的替代宿主截图）。
- 让 `propose_ticket_triage` 支持批量（目前故意一张一张提，避免模型一次改多张难以复核）。
- 把"退回理由"回灌到下一次提议的上下文里，减少重复犯同样的归属判断错误。
- 加一个 `expire` 规则：`proposed` 超过 N 小时自动回 `pending`，避免看板积压。
