# Support Ticket Workbench (`@xpert-ai/plugin-support-ticket`)

面向中小型 B2B 客服与售后团队的业务应用插件：把客服「逐条读客户消息、凭经验判断类别与紧急度、从零手打回复」的工作方式，改成 **提交客户消息 → AI 分类定级并生成回复草稿 → 人工校对确认 → 归档可查** 的固定流程。AI 只提供建议，任何人看到的正式记录都必须经过人工确认。

> English summary: an Xpert Agentic App plugin that turns raw customer messages into classified, prioritized and archived support tickets with a human-confirmed reply draft.

## 1. 产品说明

| 项 | 内容 |
| --- | --- |
| 目标用户 | B2B 客服/售后团队的一线客服专员及其主管 |
| 原有工作方式 | 在邮件与 IM 之间逐条阅读客户消息，靠个人经验判断类别与紧急程度，再从零手打回复 |
| 痛点 | 分类口径不一致、紧急工单被埋、同类问题重复处理、事后无法回溯「当时是怎么判的、改了什么」 |
| AI 的作用 | 一次真实模型调用完成两件事：把非结构化客户消息映射到统一类别与优先级（附可核对的定级依据），并生成可直接使用的回复草稿 |
| 人的作用 | 校对并修改类别、优先级与草稿，「确认并归档」是唯一把 AI 建议变成正式记录的路径；系统不会自动发送任何内容 |
| 明确不做 | 不做真实发送渠道集成、不做多智能体编排、不做复杂 RBAC、不做多端适配（题目中均为按需选用项） |

**业务流程**

```
客服专员                      Xpert 工作台                       助手（模型 + 插件工具）
   │  粘贴客户消息 ─────────▶ 新建工单（幂等键 requestId）
   │                          状态 processing ──── 发送提示词 ──▶ 读取消息，调用工具
   │                                                              support_ticket_save_triage
   │                          状态 pending_review ◀── 工具落库 ───┘
   │  校对类别/优先级/草稿 ──▶ 保存草稿（乐观锁 revision）
   │  点击确认并归档 ────────▶ 状态 confirmed，写入最终回复与操作记录
   │
   └─ 失败时：状态 failed + 可读原因 + 「重试」按钮，重试复用同一张工单
```

**状态机**：`processing`（已提交/AI 处理中）→ `pending_review`（待人工确认）→ `confirmed`（已确认归档）；任一步失败落 `failed`，可重试。

**关键业务规则**（均有单测覆盖）

- `requestId` 幂等：重复提交返回同一张工单，不产生第二条业务记录。
- `revision` 乐观锁：保存草稿/确认时若工单已被他人修改，返回 `revision_conflict`，页面保留当前修改不静默覆盖。
- 已确认的工单不可改写：AI 结果、失败标记、重试一律返回 `already_confirmed`。
- 失败重试不重复产生业务结果：同一 `ticketId` 重新进入处理，`attemptCount` 递增，事件时间线保留完整过程。
- 范围隔离：所有查询按 `tenantId + organizationId` 过滤，幂等键复用同样受范围校验。

## 2. 目录结构

```
community/apps/support-ticket/
├── package.json / index.cjs / tsconfig*.json     # 包元信息（exports 保留 default）、编译与测试配置
├── .env.example                                  # 本地安装所需环境变量占位（不含任何真实密钥）
├── scripts/build-remote-components.mjs           # esbuild 打包远程界面为单文件 IIFE
├── scripts/copy-assets.mjs                       # 拷贝助手模板与远程界面产物到 dist
├── src/index.ts                                  # 插件入口：meta / config / templates / register / onStart / onStop
├── src/xpert-support-ticket-assistant.yaml       # 助手模板 DSL（挂载中间件工具）
└── src/lib/
    ├── constants.ts                              # 名称、feature、视图与工具 key、动作与结果码、选项列表、图标
    ├── types.ts                                  # 状态、动作、入参出参等业务类型
    ├── support-ticket.config.ts                  # zod 配置 schema + 表单 schema + 环境变量默认值 + DI 令牌
    ├── support-ticket.plugin.ts                  # @XpertServerPlugin：TypeORM 实体与 provider 注册
    ├── entities/support-ticket.entity.ts         # plugin_support_ticket 表
    ├── support-ticket.service.ts                 # 业务服务：状态机、幂等、乐观锁、范围隔离、视图数据
    ├── support-ticket.middleware.ts              # 助手中间件工具：保存分类结果 / 检索 / 详情
    ├── support-ticket-view.provider.ts           # 视图清单、远程组件入口、动作分发、助手提示词构造
    ├── support-ticket.templates.ts               # 助手模板贡献
    └── remote-components/support-ticket/         # 工作台界面（隔离 iframe）
        ├── app.js / app.css                      # 构建产物与空样式（预览宿主需要 app.css）
        ├── preview.config.mjs                    # 本地预览宿主配置（含 mock 数据与失败开关）
        └── src/{main.tsx,bridge.ts,utils.ts,i18n.ts,styles.ts,types.ts,components/*}
tests/                                            # 19 项单元测试（node:test）
```

## 3. 环境要求与本地验证

```bash
# 依赖（在 community 工作区安装；本插件不发布 npm 包）
corepack pnpm install --filter "@xpert-ai/plugin-support-ticket..."

cd community/apps/support-ticket
corepack pnpm run typecheck          # 服务端类型检查
corepack pnpm run remote:typecheck   # 远程界面类型检查
corepack pnpm run test               # 19 项单元测试
corepack pnpm run build              # 远程界面打包 + 服务端编译 + 资源拷贝
corepack pnpm run verify             # 上述四步串行执行

# 插件生命周期验证（在插件仓库根目录，需先构建 plugin-dev-harness）
node plugin-dev-harness/dist/index.js \
  --workspace ./community/apps/support-ticket \
  --plugin @xpert-ai/plugin-support-ticket

# 远程界面本地预览（需先 build）
corepack pnpm remote-view:preview \
  --config community/apps/support-ticket/src/lib/remote-components/support-ticket/preview.config.mjs
# 打开输出的地址即可看到工作台；在客户消息中输入「模拟失败」可复现失败与重试路径
```

## 4. 安装到 Xpert

1. 准备 `community/.env`（模板见 `community/env.example`），填入 `XPERT_API_URL`、`XPERT_ORG_ID`、`XPERT_TOKEN`；本插件 `meta.level` 为 `organization`，安装范围需与之一致。
2. 在宿主根目录执行部署：

   ```bash
   corepack pnpm plugin:deploy:local \
     --plugin-dir <plugin-repo-root>/community/apps/support-ticket \
     --scope organization --api-url "$XPERT_API_URL"
   ```

   或按宿主提供的帮助脚本 `pnpm plugin:install:local --workspace-path <plugin-dir> --org-id "$XPERT_ORG_ID" --token "$XPERT_TOKEN" --api-url "$XPERT_API_URL"`。
3. 确认安装回执为 loaded（若返回 `restartRequired`，重启测试 API 后再验证）。
4. 在助手模板入口创建「客服工单助手」，选择本实例可用的模型并发布。
5. 打开客服工单工作台，确认助手与工作台已关联（模板的 `defaultConfig.viewProvider` 指向本插件的视图提供者）。
6. 走一遍真实流程：录入客户消息 → 提交 → 等待 AI 结果 → 校对 → 确认并归档 → 刷新后仍可查到该工单与最终回复。

模型凭证通过平台配置或环境变量提供，插件代码内不含任何密钥。可选的插件配置项 `aiTimeoutSeconds`（默认 90 秒，亦可用环境变量 `SUPPORT_TICKET_AI_TIMEOUT_SECONDS` 覆盖）决定工作台等待助手返回结果的看门狗时长，超时会把工单标记为失败并开放重试。

## 5. 验证结果

| 层次 | 命令 | 结果 |
| --- | --- | --- |
| 单元测试与类型检查 | `corepack pnpm run test` / `typecheck` / `remote:typecheck` | 通过：19 项测试全部成功（业务规则、输入校验、状态流转、幂等、乐观锁、范围隔离、桥接契约） |
| 构建 | `corepack pnpm run build` | 通过：`dist/index.js`、`dist/xpert-support-ticket-assistant.yaml`、`dist/lib/remote-components/support-ticket/app.js` 齐全 |
| 仓库约束 | `node community/scripts/check-entity-names.mjs` | 通过：实体表名以 `plugin_` 开头 |
| 插件生命周期 | `node plugin-dev-harness/dist/index.js --workspace ./community/apps/support-ticket --plugin @xpert-ai/plugin-support-ticket` | 通过：入口解析到 `dist`、`register`/`onStart`/`onPluginBootstrap`/`onPluginDestroy`/`onStop` 全部完成，配置 JSON 校验通过 |
| 界面资源与桥接 | `pnpm remote-view:preview --config .../preview.config.mjs` | 通过：预览宿主用构建产物生成 iframe HTML（HTTP 200，含工作台 bundle），`requestData` 返回 `items/total/summary/meta` |
| 平台真实业务流程 | 需要真实 Xpert 实例（`api-url`/`scope`/账号） | **尚未执行** |

**尚未验证的部分（等待接入现有实例）**：平台内真实渲染与鼠标交互、真实模型调用的分类与草稿质量、安装回执与插件加载、助手模板创建与工具/工作台绑定、真实数据的保存恢复与失败重试。harness 与预览宿主都使用内置 mock，**不能**据此宣称真实数据库、权限或业务流程已经通过。

## 6. 运行截图

本插件的样式由 bundle 注入，工作台在平台 iframe 内运行。平台内运行截图需在真实实例验证时采集，计划按以下清单补充到本节（图片随代码提交，使用相对路径引用，例如 `images/workbench-list.png`）：

1. `images/workbench-intake.png`：工单录入界面（必填校验与空状态）。
2. `images/workbench-ai-result.png`：AI 返回的类别、优先级、定级依据与回复草稿。
3. `images/workbench-confirmed.png`：人工修改后确认归档，列表状态变为「已确认」。
4. `images/workbench-failure.png`：失败提示与「重试」按钮。
5. `images/workbench-restored.png`：刷新/重新进入后仍能查到该工单与最终回复。

本地预览可先用第 3 节的 `remote-view:preview` 命令查看界面，但它不是平台运行截图。

## 7. 已知限制

- 列表查询为范围内一次性取回后在内存中过滤与分页（上限 500 条），工单量级增大后应改为数据库分页与索引查询。
- 未接入真实发送渠道：确认归档后的回复仍需人工复制到邮件或 IM 中发送。
- 分类与优先级取固定枚举；如需自定义类别体系，需要扩展 `src/lib/constants.ts` 与服务端校验。
- 多人协作只通过 `revision` 乐观锁保证不静默覆盖，没有实时推送；他人修改后需要手动刷新。
- 单实例租户级配置；未实现按组织自定义提示词模板。

## 8. AI 协作说明

- 工具与模型：CodeBuddy（DeepSeek-V4.1-Flash）+ 仓库内既有示例代码作为上下文。
- 有代表性的过程：
  1. **先摸清约定再动手**：用代码检索子代理通读 `community/apps` 下 9 个示例，确认「包名统一 `@xpert-ai/plugin-<name>`、实体表名必须 `plugin_` 开头、注册六环节必须逐一对齐」等硬约束后才开始写代码，避免自创结构。
  2. **纠正了一处会导致 AI 流程失效的误判**：最初按 `smart-maintenance` 的写法让视图动作直接返回 `commandKey/payload`，随后在 `img2threejs` 中找到真正生效的实现——动作返回 `data.clientCommand`，由远程组件显式调用 `invokeClientCommand`，且动作结果封装在桥接响应的 `result.data` 内。据此改写了客户端解析，并补了桥接契约测试锁死这一协议。
  3. **主动做了减法**：计划里包含独立的操作日志实体与保存队列类，评估后认为单表 JSONB 时间线 + 直接读取 `revision` 已能覆盖同样的业务保证，于是合并了状态机的重叠状态、去掉未使用的配置项与重复工具函数。
- 遇到过的限制：本地 pnpm 因依赖构建脚本策略无法安装 `plugin-dev-harness` 依赖，改用 npm 完成安装；无浏览器自动化环境，因此界面层只做到预览宿主的 HTTP 与桥接验证，未做像素级截图。

## 9. 复用来源与许可

- 插件骨架、注册方式、中间件工具写法参照同仓库 `community/apps/smart-maintenance`；远程组件构建脚本与 iframe 桥接参照 `community/apps/crm` 与 `community/apps/img2threejs`；`invokeClientCommand` 协议以 `img2threejs` 的可运行实现为准。
- 复用范围为工程模式与少量工具函数（shim、桥接、构建脚本），业务逻辑、数据模型、界面与文案为本插件自行实现。
- 本包遵循仓库根许可 AGPL-3.0。
