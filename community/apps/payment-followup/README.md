# 回款承诺跟进工作台

销售内勤录入一笔应收单据及客户沟通原文，AI 提取付款承诺、阻碍和待澄清事项；内勤对照证据修订并确认下一次跟进，重新打开后继续查看。

> 已在真实 Xpert 已发布 Assistant 中完成 DeepSeek Flash 验收：原文读取 → AI 草稿 → 人工修订与确认 → 整页重载恢复；另验证模糊承诺和取消/超时后的重试。测试使用虚构业务资料，模型调用及数据库持久化均为真实运行。

## 一、产品说明

### 用户与问题

唯一核心用户是销售内勤。客户经常说“周五先付三万，余款等验收”，但应收台账通常只留下一个日期或一段自由文本。金额、日期、前置条件容易混在一起，下一次跟进也没有明确依据。

本作品只处理“一笔应收 + 一次沟通 + 一次人工确认”，不扩展成完整 CRM。人民币为唯一币种，付款承诺不等于实际到账。

### 核心流程

1. 点击 **新建跟进**，填写客户、单号、应收金额、到期日、沟通日期和原文。可使用明确标注的虚构示例。
2. 保存后点击 **AI 提取承诺**；工作台把当前记录和本轮分析 ID 放入 Assistant 上下文。
3. Assistant 调用读取工具，获得原文行号；模型提取承诺，调用保存工具写入待审核草稿。
4. 内勤核对原文引用，可修改摘要、金额、日期、条件和下一步行动，填写跟进日期、备注后确认。
5. 重新进入记录读取 PostgreSQL 中的确认结果。失败或两分钟超时后，可保留原文重试。

### 关键页面结构

以下是根据已实现页面补记的结构示意，不作为开发前原型的证据。

```text
Xpert 已发布 Assistant
├─ 左侧：对话、模型执行状态、读取原文/保存草稿工具记录
└─ 右侧：回款工作台
   ├─ 顶部：新建跟进、刷新
   ├─ 列表：搜索客户/单号、业务状态、分页
   └─ 详情：应收信息 → 原文行号 → AI 草稿 → 人工确认 → 尝试历史

新建弹窗：客户、单号、未收金额、到期日、沟通日期、原文 → 保存
确认表单：摘要、金额、日期、条件、下一步行动、跟进日期、备注 → 确认
失败状态：显示原因、保留输入 → 重新分析
```

### AI 与人的边界

| 动作 | 执行者 | 约束 |
| --- | --- | --- |
| 解释自然语言付款承诺 | 平台模型 | 先读取原文；模糊金额/日期保留 null |
| 保存草稿 | Agent 工具 | 有效原文行号、当前 attemptId、严格 schema |
| 修订及确认 | 登录用户的工作台操作 | 当前 revision、金额不超过应收、跟进日期有效 |
| 记账、扣款、联系客户 | 不在范围内 | 无相关工具或 API |

每条承诺和阻碍引用服务端原文行号，界面显示服务端原文而非模型生成的“引文”。这能防止伪造行号，但不能证明语义推断正确，仍需人工核对。

### 关键取舍

- 采用 Agentic App：UI 管记录与确认，middleware 提供工具，Assistant 管模型编排。
- 模型由 Xpert 配置；插件不内置 API Key、模型供应商 SDK 或固定模型名。
- 金额以整数“分”存储；模糊承诺以 null 表示，不强行补全日期。
- 单表 JSONB 保存输入、AI 原稿、确认稿和最近 20 轮记录；便于演示与恢复，暂不支持跨记录统计。
- 不加入合同上传、OCR、邮件和定时催款，以免稀释主流程。

## 二、运行说明

### 技术栈

TypeScript 5.9（strict）、NestJS 11、TypeORM 0.3/PostgreSQL、Xpert SDK/contracts 3.29、LangChain tools、Zod 3。前端为 React 18 + TSX + esbuild，使用仓库共享 `@xpert-ai/plugin-shadcn-ui`、共享 i18n 与主题适配。

### 基线

- xpert-plugins main：`60794aa72edb1fddffebd5e5d071619b8c29014b`
- Xpert main：`83e0d4ce9462996e7a4c24517f63559bedf23b7e`
- 开发 Node：22.15.0；插件 pnpm：8.15.8；平台 pnpm：10.24.0。
- 安装级别：tenant；artifact namespace：`payment_followup`。
- 数据访问必须同时匹配 tenant、organization、user、assistant；不从模型输入接收身份。

### 环境变量示例

下列值仅为占位示例，须替换为自己的路径、测试租户和专用测试数据库。凭证只通过本地进程环境或平台支持的安全配置注入；不要提交填入真实值的文件。

```bash
export XPERT_PLATFORM_ROOT='/absolute/path/to/xpert'
export PAYMENT_PLUGIN_DIR='/absolute/path/to/xpert-plugins/community/apps/payment-followup'
export XPERT_API_URL='http://localhost:3300'
export XPERT_TENANT_ID='YOUR_TEST_TENANT_UUID'
export XPERT_USERNAME='YOUR_LOCAL_TEST_ACCOUNT'
# XPERT_PASSWORD：由本地安全配置注入，不把真实值写入示例。
export PAYMENT_TEST_DATABASE_URL='postgresql://TEST_USER:REPLACE_ME@127.0.0.1:25432/TEST_DATABASE'
```

DeepSeek 等供应商密钥在 Xpert 模型管理中配置，不是本插件的环境变量。宿主仍需按其 README 配置数据库、Redis、模型和 `PLUGIN_WORKSPACE_ROOTS`；上述示例仅覆盖插件构建、部署及测试使用的变量。

### 构建与测试

从仓库根目录进入本包。包内工作区只包含本包和仓库共享 UI。先将 `XPERT_PLATFORM_ROOT` 指向已安装依赖并完成构建的 Xpert checkout。

```bash
cd community/apps/payment-followup
corepack pnpm install --frozen-lockfile
corepack pnpm build
NODE_PATH="$XPERT_PLATFORM_ROOT/node_modules" corepack pnpm test
corepack pnpm verify:dist
```

确保子进程中的 `pnpm` 也由 Corepack 管理，避免系统 pnpm 与项目版本冲突。`test` 默认执行规则及平台契约测试；未设置 `PAYMENT_TEST_DATABASE_URL` 时明确跳过数据库集成测试。

数据库测试仅在指定测试库创建随机 schema，结束后删除该 schema。不要把生产数据库地址用于测试。

```bash
# 由当前终端或安全配置注入测试数据库连接串，不提交到仓库。
# SDK 的 host peer 由当前 Xpert checkout 提供。
NODE_PATH="$XPERT_PLATFORM_ROOT/node_modules" corepack pnpm test
```

浏览器组件检查（模拟宿主与固定模型输出，不能代替真实 AI 验收）：

```bash
NODE_PATH="$XPERT_PLATFORM_ROOT/node_modules" PLAYWRIGHT_CHANNEL=chrome corepack pnpm test:ui
```

此命令使用已安装的 Chrome；也可先安装 Playwright Chromium 并省略 channel。覆盖新建、桥接、错误恢复、金额修订、确认、刷新和英文界面。

官方 harness（先按其 README 安装、构建）：

```bash
# 在 xpert-plugins 根目录执行
NODE_PATH="$XPERT_PLATFORM_ROOT/node_modules" node plugin-dev-harness/dist/index.js \
  --workspace community/apps/payment-followup \
  --plugin @community/apps-payment-followup
```

`NODE_PATH` 仅补齐 Xpert SDK/contracts 的宿主运行依赖，例如 `short-unique-id`，不用于 UI 包解析。本插件的 UI 从当前仓库构建。安装时 contracts/chatkit-types 与 LangChain 的 peer 范围有上游警告；当前组合已完成类型检查、harness 及实际平台 DeepSeek 工具调用；升级依赖时需重新验证。

### 安装到 Xpert

1. 使用上述平台基线，启动数据库、Redis、API、Web，并完成首次租户/管理员/组织初始化。
2. 在平台 `PLUGIN_WORKSPACE_ROOTS` 中允许本包所在插件仓库，以及该 checkout 的内置插件源码目录。
3. 通过平台支持的安全配置提供登录信息或 token，不放入命令参数、文档和截图。
4. 在平台根目录执行：

```bash
corepack pnpm plugin:deploy:local --plugin-dir "$PAYMENT_PLUGIN_DIR" --scope tenant \
  --tenant-id "$XPERT_TENANT_ID" --api-url "$XPERT_API_URL"
```

5. 本包注册实体，安装可能返回 `restartRequired`。按平台流程重启 API，检查 readiness 和插件实际加载状态。
6. 从插件贡献的“回款承诺跟进助手”模板创建 Assistant，选择已配置且支持工具调用的模型，发布 Assistant。
7. 从已发布 Assistant 打开“回款承诺”工作台，按核心流程验证。源码修改需重新构建、刷新安装；实体或服务器代码修改后需按平台状态重启。

插件本身没有模型凭证字段。模型服务、模型名、供应商密钥属于 Xpert 的模型配置；切换模型不要求改插件源码。

## 三、运行截图与演示

2026-10-31 在上述平台基线、已发布 Assistant 和真实 PostgreSQL 上验收。运行模型为平台内配置的 **DeepSeek / deepseek-flash**，关闭 thinking，temperature 0.1、max_tokens 4096。插件模板不绑定该供应商。步骤与结果见 [验收记录](docs/acceptance.mdx)，可检查[脱敏持久化结果](docs/acceptance-receipt.json)。

| 场景 | 证据 |
| --- | --- |
| 输入应收与沟通原文 | [新建记录](docs/images/01-create.png) |
| 真实模型工具调用与草稿 | [工具执行](docs/images/07-tools.png)、[待确认草稿](docs/images/02-ai-draft.png) |
| 人工修订与确认 | [确认结果](docs/images/03-confirmed.png) |
| 顶层页面重载后恢复 | [重新打开](docs/images/04-reopened.png) |
| 取消后保留原文并重试 | [失败可重试](docs/images/05-retry.png)、[重试成功](docs/images/08-retry-success.png) |
| “现在不能承诺” | [空承诺与待澄清问题](docs/images/06-ambiguous.png) |

新建记录：录入虚构应收单据及沟通原文。

![新建记录：录入虚构应收单据及沟通原文。](docs/images/01-create.png)

AI 处理：实际 Assistant 执行读取原文、保存草稿工具。

![AI 处理：实际 Assistant 执行读取原文、保存草稿工具。](docs/images/07-tools.png)

AI 结果：带原文行号的待确认草稿，未知字段保持空值。

![AI 结果：带原文行号的待确认草稿，未知字段保持空值。](docs/images/02-ai-draft.png)

人工确认：核对并修改摘要，填写跟进日期后保存。

![人工确认：核对并修改摘要，填写跟进日期后保存。](docs/images/03-confirmed.png)

保存恢复：顶层页面刷新后，仍能读取人工确认结果。

![保存恢复：顶层页面刷新后，仍能读取人工确认结果。](docs/images/04-reopened.png)

异常状态：主动停止分析，保留原文并提供重新分析按钮。此图不是供应商故障证据。

![异常状态：主动停止分析，保留原文并提供重新分析按钮。此图不是供应商故障证据。](docs/images/05-retry.png)

重试结果：同一记录重新调用真实模型，历史失败轮次保留。

![重试结果：同一记录重新调用真实模型，历史失败轮次保留。](docs/images/08-retry-success.png)

模糊输入：客户不能承诺时，不编造付款金额和日期。

![模糊输入：客户不能承诺时，不编造付款金额和日期。](docs/images/06-ambiguous.png)

## 四、验证结果

- 严格前后端类型检查、完整构建、分发资产与源码一致性检查通过。
- Node 报告 **45 项通过、0 失败、0 跳过**：27 项规则测试、2 项平台契约测试、6 项模型失败保护测试、真实 PostgreSQL 父测试及 9 个子场景。覆盖幂等创建、四层隔离、行锁竞争、旧轮次拒绝、连接重建后恢复及超时持久化。
- 官方 harness 加载和关闭通过。其数据库为 mock；真实数据库验证是上述独立 PostgreSQL 测试。
- Playwright 组件测试通过：模拟宿主、固定模型输出，覆盖金额修改、超额拦截、确认、自动恢复和双语。它与真实模型验收分开记录。
- 实际 Xpert 安装、模板同步/发布、DeepSeek 工具调用、人工确认、页面恢复、模糊结果和取消/重试均通过。
- Mintlify 文档 build/validate 通过。

**任务书故障场景已补验（2026-11-01）：** 在独立模型配置上实际返回 HTTP 503，工作台约 3.4 秒内显示并保存 model_failed；刷新保留原文与错误。恢复真实 DeepSeek 后，同一记录以新 attemptId 重试、人工确认、再次刷新均成功。唯一单号只有一条业务记录、一条付款承诺。详见 [完整复现步骤](docs/fault-injection.mdx) 与 [阶段数据及 HTTP 审计](docs/fault-acceptance-receipt.json)。

模型服务返回 503 后，聊天与工作台均显示失败原因；原文保留，支持重新分析。

![真实模型服务故障](docs/images/09-model-unavailable.png)

恢复真实 DeepSeek 后，同一记录重试成功，人工确认后整页重载恢复。

![模型恢复、重试与确认](docs/images/10-model-recovered.png)

模型调用不保证每次输出字句相同；本次仅验证少量虚构样例，未做模型质量对比、生产容量测试或完整安全审计。

## 五、AI 协作说明

使用 Codex（本次会话为 GPT-6）辅助阅读 SDK/平台源码、分析参考 PR、生成初稿、检查错误和编写测试。业务运行模型为平台配置的 DeepSeek Flash，两者用途不同。模型服务运行验收不等于开发 AI 已参与，不混用两类证据。

代表性协作过程：

1. **提供背景**：将 Word 任务书、官网、插件仓库及 #668 交给 Codex，要求先理解平台约束与文档结构，再选择一个完整业务流程。
2. **范围取舍**：把实现限定为销售内勤的一笔应收与一次沟通，不加入 OCR、ERP、批量导入和自动催款；前端采用仓库共享组件，而非直接照搬 #668 的浏览器 JavaScript。
3. **联调与验证**：选择 DeepSeek，凭证通过本地配置进入平台。用真实页面定位 view key、运行上下文及 iframe 重建问题；修复后用真实模型、数据库断言和页面刷新验证，分别记录模拟测试和实际验收。

以下是本次与 AI 协作中形成的实现选择；面试时应结合代码解释，不能把 AI 的结论当成自己已经理解的证明。

实际修改过的关键决策：

- 从泛化的应收管理收缩为“付款承诺核对与跟进”，控制面试范围。
- 用 attemptId 阻止超时或失败的旧结果覆盖新一轮分析，用 revision 阻止并发人工覆盖。
- 数据库测试发现 JSONB 字段顺序会改变，改为按 schema 规范化比较，保留幂等行为。
- 规则测试发现 trim 会改变原文，改为保留原始文本，仅检查有效长度。
- 前端金额改为确认时统一解析，避免输入框失焦与确认事件之间使用旧金额。
- 真实平台发现视图本地 key 不能含 `__`；改为由平台组合 provider 与 key，并添加模板契约测试。
- 真实模型调用发现 runtime 两种 context 容器不能整体校验；改为独立解析有效候选，补回归测试。
- 故障注入发现仅等超时不够清楚；增加模型异常钩子，立即持久化当前轮次失败，并保护重试轮次与已保存草稿。
- 新对话会重建 iframe；使用宿主保存视图状态，并在新作用域恢复最近更新的记录。

## 六、已知限制与下一步

- 仅 CNY、单记录、单次人工确认；确认后不直接编辑，应保留审计并另行设计变更流程。
- 只校验引用存在，不自动证明引用支持结论；提示注入约束主要来自系统提示及有限工具权限。
- 两分钟超时由读取/操作时发现，不是后台定时任务；中止只使本轮结果失效，不保证取消供应商计费。
- 未做自动邮件、真实到账核销、跨用户共享和定时提醒。
- 下一步优先补充更多真实业务表达的离线评测，再考虑“待跟进列表 + 到期提醒”。

## 七、源码与参考

- `src/lib/domain.ts`：状态机、金额日期、证据、重试和确认规则。
- `src/lib/payment.service.ts`：作用域查询、行锁、JSONB 持久化。
- `src/lib/payment.middleware.ts`：三项 Agent 工具及上下文注入。
- `src/lib/payment-view.provider.ts`：工作台声明、数据查询、人类操作入口。
- `src/assistant.yaml`：无绑定凭证/模型的 Assistant 模板。
- `remote/`：共享 UI、主题、i18n 与 postMessage 通信。
- `tests/`：业务与 PostgreSQL 测试；`docs/`：Mintlify 文档和验收记录。

文档组织参考 [PR #668](https://github.com/xpert-ai/xpert-plugins/pull/668) 的产品—运行—截图—验证—AI 协作—限制结构。业务代码按本题重新实现，未复制其产品文案、截图、测试计数或作者身份。遵循本仓库 AGPL-3.0 许可；共享 UI 及第三方包保留各自许可证。
