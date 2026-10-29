# 插件安装与真实平台验收

本文只覆盖插件层。Xpert 基础服务、数据库和模型提供商先按项目的本地环境说明准备。本文未宣称真实平台已安装或真实模型已验收。

## 1. 固定身份

| 项目 | 值 |
| --- | --- |
| 包 | `@community/apps-support-triage` |
| 版本 | `0.1.0` |
| SDK / Contracts | `3.18.4` |
| 插件级别 | `tenant` |
| artifactNamespace | `support_triage` |
| middleware provider | `support_triage.analysis` |
| Feature | `support_triage.review` |
| View provider / 本地 View key | `support_triage.view-provider` / `support_triage.workbench` |
| Assistant 模板原始 key | `support-triage-assistant` |
| 模板 provider | `support_triage.templates` |

`tenant` 级插件包含 TypeORM 实体，应使用官方部署工具的 `--scope tenant`。它与 App 初始化的 `scope: organization` 含义不同：前者控制插件在宿主的安装范围，后者控制专用工作空间与 Assistant 的业务初始化范围。

## 2. 构建和本地检查

在仓库内安装好 `package.json` 声明的依赖及共享 `@xpert-ai/plugin-shadcn-ui` 包后，从 `community/apps/support-triage` 执行：

```sh
corepack pnpm run typecheck
corepack pnpm run test:domain
corepack pnpm run build
corepack pnpm run verify:dist
```

`build` 会清理本包 `dist`，编译带装饰器元数据的后端、构建 Remote UI、复制 Assistant YAML 和内联 HTML，并生成源文件与产物 SHA-256 清单。`verify:dist` 拒绝源文件变化后未重建或产物被修改的情况。

本次后端实际已运行并通过的等价命令为 `tsc -p tsconfig.json --noEmit`、`tsc -p tsconfig.tests.json`、`tsx --test tests/domain.test.ts tests/plugin.test.ts`；后端共 21 项测试。后端已编译到 `dist`。

官方生命周期验证从插件仓库根目录运行，Node 24 已验证可用：

```sh
node plugin-dev-harness/dist/index.js \
  --workspace ./community/apps/support-triage \
  --plugin @community/apps-support-triage
```

本次该 harness 已通过，默认 mocks 开启。它检查加载与 Nest 生命周期，不会代替实际宿主、实际数据库和模型调用。完整前端构建与检查结果以交付的验收记录为准。

## 3. 准备安装配置

按照仓库 `AGENTS.md`，平台连接配置放在 `community/.env`，从 `community/env.example` 复制并手工填写以下值：

- `XPERT_API_URL`：可访问的 Xpert API 地址。
- `XPERT_USERNAME`、`XPERT_PASSWORD`：优先使用有权安装插件的本地登录账户；部署工具每次登录获取新的 JWT。`env.example` 已提供空字段，填写后的值只保存在本地配置或秘密存储中。
- `XPERT_TOKEN`：可选的令牌认证替代项，默认留空。按当前官方工具的实际优先级，显式 token 参数覆盖其他认证；其次是账户登录；环境变量 `XPERT_TOKEN` 仅在未提供账户凭据时使用，不会覆盖已配置的账户登录。
- `XPERT_TENANT_ID`：目标租户的真实 ID。
- `XPERT_SCOPE=tenant`：供当前官方部署工具使用；命令中仍显式传 `--scope tenant`。
- `XPERT_ORG_ID`：后续 App 初始化使用的业务组织；tenant 安装的请求头不会使用它作为组织安装范围。

本插件配置为严格空对象，不需要模型密钥或其他插件的配置 JSON。不要复用示例中 sales-ontology 的 `XPERT_PLUGIN_CONFIG_JSON`。模型连接在 Xpert 的模型配置中管理。

推荐保持 `XPERT_TOKEN` 为空，使用 `XPERT_USERNAME` / `XPERT_PASSWORD` 获取新令牌。不要把密码或令牌传入聊天、源码、README 或命令参数。加载 `.env` 时不要打印其内容。`XPERT_INSTALL_SCOPE` 是旧 community 示例字段，当前 `plugin:deploy:local` 读取的是 `XPERT_SCOPE`，显式 CLI 参数优先。

## 4. 使用官方部署命令

以下示例适用于平台和插件路径均可在同一开发环境中解析的 shell。`XPERT_PLATFORM_DIR` 指向 Xpert 平台源码，`XPERT_PLUGINS_DIR` 指向插件仓库。容器部署时，插件源路径必须在后端可见；按环境说明挂载对应目录，不能直接把 Windows 路径发给 Linux 后端。

```sh
set -a
. "$XPERT_PLUGINS_DIR/community/.env"
set +a
cd "$XPERT_PLATFORM_DIR"

corepack pnpm plugin:deploy:local \
  --plugin-dir "$XPERT_PLUGINS_DIR/community/apps/support-triage" \
  --scope tenant \
  --manifest-file "$XPERT_PLUGINS_DIR/community/apps/support-triage/work/deployment.json"
```

命令对应所固定平台源码中的 `tools/scripts/deploy-local-plugin.mjs`，会按包脚本构建、测试，运行声明的 `verify:dist`，尝试刷新已有本地注册或执行 code 安装，随后读取 descriptor 验证并可写入无密钥部署记录。

安装返回 `restartRequired` 时，按平台流程重启后端。随后核对实际加载 descriptor：包名、版本、级别、命名空间、middleware、View、模板均正确。成功安装插件不等于已初始化或发布 Assistant。

## 5. 首次初始化 Assistant

1. 登录目标租户及业务组织，在模型设置中配置一个支持工具调用的主聊天模型，并先验证该模型可用。本模板没有写死模型厂商、密钥或假模型。
2. 在 Explore/App 中找到“客服工单审核台”。其 App 配置只链接本插件的 `support-triage-assistant` 模板，要求主模型并创建专用组织工作空间。
3. 使用平台的 App 初始化流程创建工作空间和 Assistant。若采用平台的模板安装入口，则从同一个插件模板创建一次，并按平台要求配置主模型、保存并发布。
4. 在 Assistant 画布核对主节点 `Agent_SupportTriage` 直接连接 `Middleware_SupportTriage`，后者 `provider=support_triage.analysis`、`required=true`。发布后的图也应保留这条连接。
5. 在已发布 Assistant 的对话中打开“客服工单审核台”。确认当前宿主识别 `support_triage.review`，出现 `support_triage.workbench`，且三个工具名称与代码完全一致。

如果界面没有该 View，先检查插件是否已加载、middleware 是否直接连接主 Agent、Assistant 是否重新发布及当前用户是否在相同组织与工作空间。不要通过手动伪造 Feature 或修改业务记录来绕过。

### 更新已安装 Assistant

后续模板变化应先部署插件，然后在原 Assistant 画布通过 `Assistant Settings → Update from Template` 更新，保存并发布。保留原 Assistant ID、slug、会话和业务绑定，不重复通过创建向导安装新 Assistant。

## 6. 真实验收步骤

使用无真实个人信息的样例：

> 标题：付款状态异常；客户代称：测试客户 A；原文：付款后被重复扣款两次，订单还显示未支付，请帮我核对。

| 验收项 | 操作 | 必须看到的证据 |
| --- | --- | --- |
| 创建 | 在审核台提交样例 | 数据库生成一条 `new` 工单；刷新后仍存在 |
| 真实 AI | 点击 AI 分析 | 当前 Assistant 收到原生命令；执行记录出现 `get_ticket` 后接 `save_analysis`，而非仅输出文字 |
| AI 结果 | 等待完成 | `pending_review`；结构完整；证据可逐字定位到原文；回复明确是草稿 |
| 人工修改 | 修改分类、优先级和回复后确认 | `confirmed`；刷新或重开后保留最终内容、确认人和时间，原 AI 建议仍可核对 |
| 真实失败 | 使用不可用模型配置或中断本次模型执行 | 不虚构成功；工具能报错时保存失败，否则结束/超时回收可恢复 |
| 失败重试 | 修复模型，刷新并重试 | 新 `attemptId`，可成功；旧回调不能覆盖当前结果 |
| command 失败 | 在不支持该命令的宿主或测试拦截中触发发送失败 | UI 提示并调用 `abort_analysis`，保存 `dispatcher_unavailable`；不无限转圈 |
| 人工结束 | 在 processing 点击结束本次分析 | `failed/user_cancelled`，可重试；迟到结果被拒绝 |
| 并发冲突 | 两个页面同时确认同一版本 | 一次成功；另一次提示冲突并刷新，不覆盖已保存内容 |
| 隔离 | 换用户或组织访问同一 ID | 无法读取/操作其他作用域工单；列表不泄漏记录 |
| 重启 | 保存工单后重启服务并重新打开 | 数据仍存在，未完成分析可回收重试 |

保留截图、无密钥部署记录、真实执行 ID、测试工单 ID、实际状态及结果。只有以上真实平台闭环完成后，才能将“平台安装、真实模型与安装后 iframe 验收”标为通过。

## 7. 常见问题

- `forbidden`：View 缺少主 Agent 的 `support_triage.review` 能力，或宿主类型不匹配。
- `not_found`：ID 不存在，或用户、组织、工作空间、Assistant 与创建时不同；错误不会透露跨作用域数据是否存在。
- `invalid_input`：必填身份或输入缺失、枚举/UUID 不合法、存在额外字段。不要用空字符串代替组织或工作空间身份。
- `conflict`：已有新版本；保留尚未提交的人工编辑，读取当前内容后决定下一步，不猜版本号。
- `invalid_evidence`：AI 引用不是原文中的逐字片段；允许按原文纠正一次，仍失败则结束该批次。
- `stale_attempt` / `attempt_expired`：停止旧批次；从工作台刷新后发起新分析。
- 始终 `processing`：刷新或读取详情触发 3 分钟超时回收，或主动结束本次分析；本插件没有独立后台定时器。
- `operation_failed`：检查服务和数据库健康；详细诊断在服务端，UI 不显示堆栈或密钥。

需要服务端调试时设置 `SUPPORT_TRIAGE_DEBUG=true` 并按平台方式重启。完成排查后关闭；不要增加客户全文或令牌日志。
