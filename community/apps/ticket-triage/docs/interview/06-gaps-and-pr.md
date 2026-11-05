# 06 · 已知限制与 PR 形态（面试官阅读版）

> **30 秒版**：这是一个只新增 `community/apps/ticket-triage/` 的 PR（不动公共包、不动别人 app、无密钥、无 `dist`）。已知限制按"影响不影响演示"分三级：**不影响的**是外壳依赖会员子系统、只在 Windows 宿主验过、`--no-mocks` 没单独跑、模型选择受限；**必须说清的**是界面里的"失败"是 SQL 造的状态而非真实故障注入、同租户两组织隔离未验。每条都给了"如果要补，怎么补"。
>
> **看这一份能判断**：候选人是否诚实（限制写得比缺陷还清楚）、是否理解边界在哪。
> **最该看的**：第 2 节第 1 条（平台自带外壳的三堵墙）与第 3 节第 4 条（失败是造的）。

---

## 1. PR 形态

| 项 | 内容 |
| --- | --- |
| 目标 | `xpert-ai/xpert-plugins` 的 `main`（基线 `dfad5423205811b3251628ee9bf59a79a4bcbd87`） |
| 分支 | `feat/ticket-triage-app`，只新增 `community/apps/ticket-triage/` |
| 改动范围 | 源码、测试、`docs/interview/`、`screenshots/`、`README.md`、两个 tsconfig、`package.json`；另有 `community/pnpm-lock.yaml` 一个 importer 条目 |
| 不动的 | 公共包、`pnpm-workspace.yaml`、其他 app、宿主仓库 |
| changeset | 未加——`community/apps` 下既有 app（如 dockyard）也没有单独 changeset；维护者要求可补 |
| 提交前检查 | `typecheck` → `test` → `build` → `verify:dist`（全部通过，见 [03-validation.md](03-validation.md)） |
| PR 规模 | 8 commits / 52 files / +3321 −1（题面 [59] 明说提交次数不作为评分依据，所以按主题分 commit） |

## 2. 限制 A：不影响演示，但需要知道

1. **平台自带工作台外壳已跑通，但依赖会员子系统**。配好 `APP_PLATFORM_FILE` / `APP_PLATFORM_ENVIRONMENT_FILE` 后 `mode: managed-apps`，provisioning 依次卡在：
   - `application_trial_unavailable` → 缺 `FEATURE_MEMBERSHIP_PLAN` 与默认 `membership_plan`（seed 库里计划与 `user_membership` 都是 0 行）；
   - `application_model_binding_unavailable` → `copilot.role` 是空串 + provisioner 在 BullMQ 上下文里取不到 provider（**宿主侧真实缺陷**：需把 `captureRequestContext` 提到 `models.resolve()` 之前）；
   - `application_preparation_failed` → 平台自己的 provisioning actor 只有 2 条权限。
   补齐后 `ready:true`，`/chat/x/community-apps-ticket-triage-studio-<orgId>/c?view=ticket_triage.board__ticket_triage.board-view` 能看到 `工单分诊` tab（截图 13/14）。所以这条不是"外壳不可用"，而是"**托管外壳需要会员计划与 provisioning actor 权限，seed 默认数据不提供**"。没配的机器上仍可用替身宿主复现 06/07。
2. **只在 Windows 宿主 + Linux 容器基础设施上验证**。宿主侧为跑通改了 5 处上游文件（spawn `.cmd`、目录 fsync、插件动态 `import`、provider 目录推断、provisioner 请求上下文），**这些不进本 PR**，意味着"别的机器一键跑通"还没被证明。
3. **`--no-mocks` 生命周期没单独跑**：只跑了 harness 默认 mock 模式；真实数据库路径由真实部署 + 业务流覆盖。
4. **模型选择受限**：智谱插件 `validateCredentials` 固定 `thinking: disabled` 试调，`glm-5.3-flash` 因"始终思考"过不了平台校验，是加进 `copilot_provider.options.enabledModels` 后由内置 yaml 提供元数据；`glm-4.5-flash` 校验通过但一次工具调用约 16 s。
5. **工具参数名踩过平台的坑**：`team` 每轮被静默丢弃（`Received tool input did not match expected schema`），改 `owningTeam` 后正常；换模型/版本需重验（见 [03-validation.md](03-validation.md) 第 4 节）。
6. **表结构与归属的取舍**：`workspaceId` / `userId` 保留在表里但不参与归属键（团队共享看板，按 `tenant + organization + xpertId`）；要按用户隔离需重新引入并同步两侧 scope 计算。
7. **`seed_tickets` 是演示用写操作**，暴露在工具栏；生产形态应收进初始化流程或加开关。

## 3. 限制 B：影响"证据强度"，必须说清

8. **界面里的失败是模拟的**：截图 11/12 那张"需重试"是用 SQL 标 `failed` + `lastErrorCode=model_timeout` 造的，随后真点「重试分诊」→ 回 `pending`、尝试次数保留、表里仍 4 行。它证明"失败态可读、可重试、不重复建单"，**不是真实模型超时**；真故障注入要打断模型网关，没做。同理截图 13 那张"待确认"也是 SQL 置的（当时本机代理把模型域名解析到 `198.18.0.48`），**但"确认"那一下是真点的**。
9. **租户隔离只验了跨租户**（`404 Not found xpert … in current tenant` / SSE 记录不存在 / 模板列表无本插件），**未验同租户两组织**。
10. **界面截图有一部分用替身宿主**：06/07（以及 09–12）是替代外壳，组件/数据/动作都是插件的、接口都是真实 `view-hosts`；替身代码随仓库提交（`tests/browser/`），可复现。

## 4. 后续可做（按优先级）

1. 真实故障注入（打断模型网关或让 provider 返回 5xx），把截图 11/12 换成真实故障证据。
2. 同租户再建一个组织，验证组织级隔离。
3. `seed_tickets` 从工具栏收进初始化流程。
4. `propose_ticket_triage` 支持批量提议但逐条确认。
5. "退回理由"回灌到下一次提议的上下文，减少重复犯同类归属错误。
6. `proposed` 超过 N 小时自动回 `pending`（`expire` 规则），避免看板积压。

## 5. 对题面的一条建议

题面 [83]–[91] 要求招聘方提供"已验证的最小完整示例"，本仓库拿到的版本里这一栏仍是 `【招聘方发出题目前补齐】`。我按 [85]–[90] 六步自己走了一遍（记录见 [03-validation.md](03-validation.md) 第 7 节），但**没有示例的题目，候选人只能靠读源码反推宿主行为**——我踩的坑（`team` 被静默丢弃、app-platform 三堵墙）本来都能被一份示例提前暴露。建议甲方补一份含固定 SHA、构建安装命令与成功截图的示例。
