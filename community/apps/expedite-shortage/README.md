# 提前交货缺料分析（Expedite Shortage Analysis）

运行在 Xpert 上的业务插件（Agentic App）。客户要求提前交货时，生产计划员在助手工作台里新建一条请求，点“AI 分析”。智能体调用工具展开 BOM、查询库存与在途、查询提前期与替代料，给出**带依据的缺料清单和建议交期**。计划员逐条采纳或驳回，确认后结论存档，刷新后仍能找回。

- 包名：`@xpert-ai/plugin-expedite-shortage`，版本 0.1.0
- 插件级别：`tenant`；产物命名空间：`expedite_shortage`（4 张表，前缀 `plugin_expedite_shortage_`）
- **数据全部是模拟数据**：BOM、库存、在途、提前期、替代料来自 `src/lib/supply/mock-data.ts`，基准日固定为 2026-11-12，不是真实企业数据

| 文档 | 内容 |
|---|---|
| [docs/product.md](docs/product.md) | 目标用户、原有工作方式与痛点、业务流程、关键页面、AI 的作用、功能取舍 |
| [docs/runbook.md](docs/runbook.md) | 环境要求、构建、安装、配置、使用步骤、常见问题 |
| [docs/validation.md](docs/validation.md) | 四层验证的操作、预期和实际结果，未验证的部分 |
| [docs/ai-collaboration.md](docs/ai-collaboration.md) | 所用工具和模型、代表性的协作过程、工具限制 |

> 文档用普通 Markdown，没有照搬部分示例插件的 Mintlify 格式（`docs.json` + `.mdx`）：题目要求截图在 GitHub 上直接显示，普通 Markdown 在 GitHub 上渲染最可靠。

## 产品说明

**目标用户**：离散制造企业（设定为做电机控制柜的中小厂）的生产计划员。

**原来的做法和痛点**：销售问“SO-1024 能不能从 12-05 提前到 11-25”，计划员要在 ERP 里逐层展开 BOM，逐个查库存和在途，再打电话问采购提前期和替代料，最后在 Excel 里汇总判断。一单要半小时到半天；漏掉二级件就会承诺错交期；结论留在聊天记录里，销售追问时拿不出依据。

**本应用的做法**：省掉查数和汇总，保留判断和拍板。

| 环节 | 谁来做 |
|---|---|
| 展开 BOM，算需求量、可用量、缺口 | 插件服务，确定性计算，可以单测 |
| 判断哪个料决定最早交期，给每个缺料选建议（催料 / 替代料 / 调整交期 / 无需处理），写出引用单号和日期的理由 | **AI** |
| 逐条采纳或驳回、确认最终交期 | **计划员**。确认和驳回只是工作台动作，**智能体没有对应的工具**，不可能自己确认自己 |

保存结论的工具只接收“物料 + 建议类型 + 建议日期 + 理由”，数字由服务端按同一份数据重算，不采用模型传来的数字。

**实现概要**：

- 服务端（NestJS + TypeORM）：4 张表（请求、分析任务、缺料结论、操作日志）+ `ExpediteService` 状态机。每张表都带 `tenantId`、`organizationId`，所有查询都按这两个字段过滤。
- 智能体：助手模板 = 1 个 Agent + 3 个中间件（上下文压缩、待办清单、`ExpediteShortageMiddleware`）。缺料中间件提供 7 个工具：读取任务、展开 BOM、查询库存与在途、查询提前期与替代料、保存缺料结论、提交分析结论、上报分析失败。工具只接收 `analysisJobId`，schema 是严格模式。
- 工作台视图：远程组件（React + 仓库自带的 shadcn 组件 + Tailwind，esbuild 打包）。“AI 分析”是视图动作：服务端建分析任务，再通过 `assistant.chat.send_message` 在新会话里发出带任务 ID 的指令。
- 可靠性：每次分析或重试都新建一个任务，界面只显示当前任务的结论；旧任务迟到的写入会被拒绝；同一任务同一物料只保存一条；超时（3 分钟）在读取时判定，不用后台定时任务。

更多见 [docs/product.md](docs/product.md)。

## 运行说明

环境：Xpert 开源版 main（验证版本 `199e67a`），Node 20，Linux 或 WSL2。插件运行时**不读取任何环境变量**，模型凭证在平台网页里配置。[`env.example`](env.example) 里只有平台部署脚本用到的变量。

```bash
# 1. 构建与测试（在插件仓库的 community/ 目录）
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @xpert-ai/plugin-shadcn-ui build   # 先构建 packages/shadcn-ui，界面构建要用它的 dist
cd apps/expedite-shortage
corepack pnpm typecheck && corepack pnpm test && corepack pnpm build

# 2. 安装（在平台仓库根目录；账号密码用 read -s 临时输入，部署后 unset）
corepack pnpm plugin:deploy:local \
  --plugin-dir ../xpert-plugins/community/apps/expedite-shortage \
  --api-url http://localhost:3000 --scope tenant --tenant-id <租户 ID> \
  --skip-build --skip-test
# 部署成功后重启 API，日志里应有 ExpediteShortagePlugin dependencies initialized
```

3. 在平台里从模板“提前交货缺料分析助手”创建助手，选模型，发布。递归上限建议改为 150（模板默认 100）。
4. 进入助手，在工作台点“载入演示请求”，选 SO-1024，点“AI 分析”。

完整步骤和常见问题见 [docs/runbook.md](docs/runbook.md)。

## 运行截图

以下截图都来自 2026-11-16 在本地 Xpert（`199e67a`）上的实际运行，模型为 DeepSeek `deepseek-v4-flash`。

### 安装与画布

插件已安装（tenant 级别，0.1.0）：

![插件已安装](docs/images/01-plugin-installed.png)

从模板创建的助手：1 个 Agent + 3 个中间件。

![助手画布](docs/images/02-canvas-template.png)

缺料中间件的 7 个工具，以及它声明的工作台视图：

![中间件与工具](docs/images/03-canvas-middleware-tools.png)

### 用户输入与校验

新建请求时不填直接保存，必填项都有提示：

![必填提示](docs/images/05-form-required.png)

目标交期晚于原交期时提示：

![日期规则](docs/images/06-form-rules.png)

载入演示请求后的列表；搜索不存在的单号时的空结果提示：

![请求列表](docs/images/07-view-list.png)

![搜索无结果](docs/images/08-empty-search.png)

### AI 分析（完整流程，SO-1024）

点“AI 分析”后，工作台显示已用时间：

![分析中](docs/images/09-analysis-running.png)

对话界面：智能体依次调用 7 个工具，22 秒完成。结论是“目标交期 11-25 不可行，建议 12-02”。

![对话与工具调用](docs/images/10-chat-analysis.png)

展开一次工具调用，可以看到“保存缺料结论”的参数：

![工具调用展开](docs/images/11-tool-call-expanded.png)

工作台显示 AI 总结论和 2 条缺料，每条有需求、可用、缺口和理由：

![待确认详情](docs/images/12-view-detail-pending.png)

逐条采纳或驳回并填备注，然后确认：

![逐条决定](docs/images/13-decisions.png)

![确认框](docs/images/14-confirm-dialog.png)

确认后状态锁定，每条显示“已采纳 / 已驳回 + 备注”：

![已确认](docs/images/15-view-confirmed.png)

刷新浏览器、重新进入助手后，结论和决定都还在：

![刷新后恢复](docs/images/16-refresh-restore.png)

### 异常情况：库存系统故障 → 重试（SO-1031）

SO-1031 打开了“第 1 次分析模拟库存系统故障”。查询库存的工具返回 `INVENTORY_UNAVAILABLE`，智能体没有编造数据，而是调用“上报分析失败”。工作台显示能看懂的原因和重试按钮：

![库存故障](docs/images/17-failure-inventory.png)

![失败的工具调用](docs/images/18-chat-failure-tool.png)

点“重试”后新建第 2 个任务并成功（S-211 缺 20，建议 12-02）。数据库里 SO-1031 有 2 个任务，界面只显示第 2 个的结论：

![重试成功](docs/images/19-retry-success.png)

### 异常情况：智能体中途停下 → 放弃 → 重试（SO-1040）

在对话里手动停止智能体，30 秒后工作台出现“放弃本次分析”：

![放弃按钮](docs/images/20-abandon-button.png)

放弃后显示原因和重试，不用等 3 分钟超时：

![已放弃](docs/images/21-abandoned.png)

重试成功：SO-1040 不缺料，结论“可行”：

![放弃后重试](docs/images/22-abandon-retry.png)

> 19～22 顶部的红色提示“工作台正在切换会话”是已知问题，见下文“已知限制”。

## 验证结果

| 层 | 内容 | 结果 |
|---|---|---|
| 1 单测与构建 | `typecheck`；vitest 42 个用例（缺料计算、状态机、幂等、超时与放弃、演示故障、工具契约、元数据与视图清单）；`build` + `verify:dist` | 全部通过 |
| 2 harness | `plugin-dev-harness` 加载本插件 | `ExpediteShortagePlugin dependencies initialized`、`Plugin loaded successfully.` |
| 3 界面 | 必填和日期校验、搜索与空结果、分析计时、确认框取消 / 确认、暗色主题徽标 | 符合预期 |
| 4 平台流程 | 安装建表、模板建助手、SO-1024 完整流程、刷新恢复、库存故障 → 重试、放弃 → 重试 | 符合预期；数据库 5 个分析任务和截图一一对应 |

**未验证**：多用户 / 多组织隔离（只用一个账号测过）；工作台刷新是由工具完成事件还是 5 秒轮询触发的；DeepSeek 以外的模型；原生 Linux / macOS 和 Docker 全量部署；真实 ERP 数据源；浏览器自动化测试；空列表引导语没有截图（文案已实现）；超时这一轮没有在平台上重测（11-14 测过一次，另有单测）。

测试版本：平台 `xpert-ai/xpert` main `199e67a`；插件仓库基线 `xpert-ai/xpert-plugins` main `fa6ca2c4`（开发和平台验证时是 `c6cb6aa`，提交前 rebase，上游改动不涉及本插件）；实际测试的插件提交 `2e3e7d9b`。详细记录见 [docs/validation.md](docs/validation.md)。

## AI 协作说明

规划用 Claude（Cowork 对话），开发和验证用 Claude Code，插件里的智能体用 DeepSeek。几个关键点：

- 不让 AI 凭记忆写 Xpert 接口：所有结论都要注明依据的源码文件，没读到的标“未核实”，开发时逐条回填。
- 对 AI 的建议有取有舍：例如主数据从“存表 + 种子”改为“常量 + 数据源接口”；参考示例装不上时换示例，而不是改示例代码。
- 问题一起定位：递归上限、往运行中的会话发消息被排队、任务卡住、平台数据丢失，都是先查日志和数据库找到原因再改。
- 验证不只看截图：每次平台操作后用只读 SQL 核对数据库。

详见 [docs/ai-collaboration.md](docs/ai-collaboration.md)。

## 已知限制

**未完成 / 已知问题**：

- 点“重试”或“AI 分析”时会新开会话，宿主切换视图上下文比界面的 0.8 秒自动重发慢，顶部会出现“工作台正在切换会话，请稍后点‘刷新’”。数据其实已经加载，但这条提示要等点“刷新”或下一次操作才会消失。改法是数据加载成功后清掉提示。
- 工作台刷新依赖分析中每 5 秒轮询兜底；平台当前只在 ClawXpert 会话页发布工具完成事件，在助手页能不能收到没有区分验证。
- 模板递归上限 100 是按 DeepSeek 一次分析约 7 轮工具调用估的，换模型时可能要调大。

**适用边界**：

- 只有模拟数据；BOM 只有两层；没有损耗率、批次、库位。
- 只有计划员一个角色；没有审批流，也不通知采购。
- 只看缺料，不看产能；不支持分批交货。

**后续最值得改进的方向**：

1. 把供应数据源换成真实 ERP 接口（上层只依赖 `SupplyDataSource` 接口，换实现即可），同时支持 Excel 导入库存快照。
2. 修掉上面的切换会话提示，并补上浏览器自动化测试。
3. 加采购角色：计划员采纳“催料”建议后通知采购确认，形成计划 → 采购的协作流。

## 复用来源与许可

本插件按仓库许可 **AGPL-3.0** 发布（见 `package.json`）。

| 来源 | 许可 | 复用内容 | 自己的改动 |
|---|---|---|---|
| `community/apps/material-identity-governance` | AGPL-3.0 | `react-shim`、`react-dom-shim` 直接复用；远程界面构建脚本 `build-remote.mjs` 和 iframe 与宿主通信的 `bridge.ts` 参考它的写法 | 构建脚本改为本插件的入口，加了 Tailwind 生成和 `--check` 一致性校验；bridge 加了宿主切换上下文时自动重发一次和稳定的错误码 |
| `packages/shadcn-ui`（`@xpert-ai/plugin-shadcn-ui`） | AGPL-3.0 | 界面组件，构建期打进 `app.js` | 不改 |
| `community/apps/smart-maintenance`、`procurement-quote-comparison`、`crm` | AGPL-3.0 | 只参考设计思路：确认动作只做成视图动作、视图动作触发对话分析、失败上报工具 | 没有复制代码 |
| Xpert Skills（`xpert-agentic-app-developer`、`xpert-plugin-development`） | 见 Skills 仓库 | 作为 AI 写代码时的规范依据 | — |
| AI 生成的代码 | — | 业务代码、单测和文档由 Claude Code 生成，我逐个阶段审阅和验证 | 过程见 [docs/ai-collaboration.md](docs/ai-collaboration.md) |
