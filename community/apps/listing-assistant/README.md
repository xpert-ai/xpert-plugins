# 批量上架助手（Bulk Listing Assistant）

> 面向商家运营的 Xpert 业务应用插件：粘贴一段供货文案，AI 抽出结构化商品字段并起草标题描述，运营核对修改后保存上架草稿；失败可重试，且不会重复产生业务结果。

- 插件包名：`@xpert-ai/plugin-listing-assistant`
- 安装级别：`tenant`（含实体与服务端模块，安装到租户域）
- 产物标识命名空间：`listing_assistant`

---

## 1. 解决什么问题

**使用者**：店铺运营专员 / 商家运营，在 PC 后台批量录入商品。

**原来的做法**：收到供货素材（一段文案，可能还有图片），逐条手填标题、卖点描述、价格、类目属性、多规格 SKU。格式不统一、容易漏字段，常被内容审核驳回返工。

**这个应用做什么**：把「粘贴文案 → 结构化抽取 → 人工核对 → 保存草稿」固化成一个工作台流程。AI 只做**抽取 + 起草 + 缺失检测**，最后一步必须由人确认。

---

## 2. 核心流程

```
① 新建任务（粘贴供货文案）
        │
        ▼
② AI 抽取 + 起草  ── 缺失字段标「缺失」、拿不准的标「待确认」
        │
        ▼
③ 运营在工作台里核对、修改、补全
        │
        ▼
④ 人工确认 → 保存草稿（状态：已保存）
        │
        ▼
⑤ 刷新 / 重新进入应用 → 任务与结果仍在（落库，不在内存）
        │
        └─ ⑥ 失败分支：模型超时 / 返回非法 JSON / 网络不可用
                 → 展示可理解原因 → 在同一任务内重试
                 → 不新建任务、不重复产生业务结果
```

任务状态机：`待解析(draft) → 解析中(parsing) → 待确认(review) → 已保存(saved)`，任一步失败进入 `失败(failed)`。

---

## 3. 界面

工作台以**远程组件（React + shadcn/ui）**挂载在助手的 Workbench 面板里，不是聊天框。左侧任务列表，右侧「供货原文 / 结构化草稿」双栏。

### 3.1 空状态与新建任务

| 空状态 | 新建任务（用户输入） |
|---|---|
| ![空状态](docs/images/workbench-empty.png) | ![新建任务](docs/images/new-task.png) |

### 3.2 AI 抽取结果（人工核对）

被 AI 补全的字段带「AI 补全」标记；缺失或不确定的字段会高亮并标「缺失 / 待确认」。

![AI 抽取结果](docs/images/ai-result.png)

### 3.3 异常场景：失败与重试

失败时展示可理解的原因，重试按钮始终在**同一个任务**内操作。

| 失败 | 同一任务重试成功（第 2 次） |
|---|---|
| ![失败](docs/images/failure.png) | ![重试成功](docs/images/retry-success.png) |

### 3.4 保存草稿

![已保存](docs/images/saved.png)

### 3.5 批量创建

多条供货文案用单独一行 `---` 分隔，一次创建多条任务。

| 批量输入 | 创建结果 |
|---|---|
| ![批量输入](docs/images/batch-dialog.png) | ![批量创建结果](docs/images/batch.png) |

### 3.6 助手与工具绑定

基于模板创建的助手已绑定模型（DeepSeek）与 4 个 Agent 工具：

![助手工作流](docs/images/assistant-graph.png)

---

## 4. 功能范围

**做**
- 任务创建 / AI 抽取 / 表单核对 / 保存与恢复
- **批量创建**：多条供货文案用单独一行 `---` 分隔，一次创建多条任务（上限 20 条）
- 失败原因展示与同任务重试（幂等）
- **错误码 + 前端本地化**：后端只返回语言中立的错误码，工作台按宿主语言显示文案
- 空状态引导
- 中英文界面（跟随宿主 locale）
- Agent 工具：助手对话里也能创建、解析、读取、保存任务

**不做**（明确取舍）
- 真实内容审核流、真实商品库对接
- 图片 OCR（只处理文本）
- 多用户权限精细化管理
- 自动发布上架（最后一步永远是人）

---

## 5. 技术实现

### 5.1 工程结构

```
community/apps/listing-assistant/
├── src/
│   ├── index.ts                         # XpertPlugin 运行时清单
│   ├── xpert-listing-assistant-assistant.yaml  # 助手模板 DSL
│   └── lib/
│       ├── constants.ts                 # 命名空间、表名、工具名、视图 key
│       ├── types.ts                     # DTO / Zod 校验
│       ├── entities/                    # 4 个 TypeORM 实体
│       ├── listing-assistant.plugin.ts  # @XpertServerPlugin 注册
│       ├── listing-assistant.service.ts # 领域服务（状态机、幂等、落库）
│       ├── listing-assistant.mapper.ts  # 纯函数：字段标记、草稿归一化（可单测）
│       ├── listing-ai.service.ts        # 调用宿主默认模型 + 结构化解析
│       ├── listing-assistant.middleware.ts      # Agent 中间件工具
│       ├── listing-assistant-view.provider.ts   # Workbench 视图与动作
│       ├── listing-assistant.templates.ts       # 助手模板贡献
│       └── remote-components/listing_assistant__remote/
│           ├── src/main.tsx             # 应用编排与数据/动作
│           ├── src/workbench-utils.ts   # 前端纯工具
│           └── src/components/          # TaskList / DraftForm / NewTaskDialog
├── tests/mapper.test.mjs                # node:test 单元测试
├── scripts/build-remote-components.mjs  # esbuild 打包 UI
├── scripts/copy-assets.mjs              # 拷贝模板与 UI 产物到 dist
└── docs/                                # 截图与面试问答
```

### 5.2 数据模型（表全部以 `plugin_listing_assistant_` 前缀）

| 表 | 作用 |
|---|---|
| `plugin_listing_assistant_task` | 上架任务：原始文案、状态、尝试次数、错误信息、解析/保存时间 |
| `plugin_listing_assistant_draft` | 结构化草稿：标题、描述、价格、币种、类目、属性 JSON、字段标记；每任务唯一 |
| `plugin_listing_assistant_spec` | 多规格：规格名、价格、库存、排序 |
| `plugin_listing_assistant_ai_run` | 每次 AI 调用记录：attempt、状态、原始输出、错误码、起止时间 |

所有查询都带 `tenantId` 与 `organizationId` 过滤，不同组织的数据互不可见。

### 5.3 AI 处理

- 通过插件 SDK 的 `XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN` 获取当前作用域的**默认对话模型**（本机配置为 DeepSeek `deepseek-flash`），不把任何模型 Key 写进代码。
- 强约束 System Prompt：只依据原文、不得编造、缺失/不确定字段要单独列出；只返回 JSON。
- 90 秒超时 + `AbortController` 取消；返回内容去 Markdown 围栏后用 Zod 校验，非法 JSON / 字段不合格会转成可读错误。
- 错误以**语言中立错误码**返回（`AI_TIMEOUT`、`AI_INVALID_JSON`、`BUSY_PARSING` 等），工作台按宿主 locale 映射为中文/英文；后端不再把界面文案写进业务逻辑。

### 5.4 Agent 工具（中间件）

| 工具 | 说明 |
|---|---|
| `listing_create_task` | 从供货文案创建上架任务 |
| `listing_get_task` | 读取任务、草稿、规格与运行记录 |
| `listing_parse_task` | 执行 AI 抽取（幂等：已有草稿的任务不会再次调用模型） |
| `listing_save_draft` | 保存人工确认后的草稿 |

助手模板 `xpert-listing-assistant-assistant.yaml` 把 Agent 与 `ListingAssistantMiddleware` 连线，安装后自动完成工具绑定。

### 5.5 Workbench 视图

- 注册在 `agent.workbench.fixed` 与 `agent.workbench.main` 两个槽位，作为助手工作台菜单出现。
- 数据与动作走视图协议：`getViewData` / `executeViewAction`，动作包括 `create_task`、`parse_task`、`retry_parse`、`save_draft`。
- 远程组件通过 iframe bridge 的 `requestData` / `executeAction` 与宿主通信；订阅 `assistant.tool.completed` 事件，助手在对话里改数据时工作台自动刷新。

---

## 6. 失败与幂等设计

1. **原子认领再调模型**：用一条带条件的 `UPDATE ... RETURNING` 把任务从 `draft/failed`（或超过 5 分钟的滞留 `parsing`）原子地切到 `parsing` 并递增尝试次数；只有一个请求能认领成功，避免并发下写入相同 attempt。
2. **每次尝试一条记录**：`(taskId, attempt)` 唯一，重试只是 attempt + 1，**不新建任务**。
3. **中断的运行记录自动回收**：认领成功后，把该任务遗留的 `running` 运行记录标记为 `failed`（`AI_RUN_INTERRUPTED`），不会永远悬挂。
4. **成功才覆盖草稿**：草稿按 `taskId` 唯一，成功时在同一事务里 upsert 草稿、替换规格、更新状态与运行记录。
4.1 **滞留解析懒回收**：工作台加载时，把超过 10 分钟仍处于 `parsing` 的任务与其 `running` 运行记录标记为失败（`AI_RUN_INTERRUPTED`），运营可直接重试。
5. **重试保护的两种情形**：
   - 任务已保存 → 重试直接返回「已有解析结果」，不再调用模型；
   - 已存在成功运行记录 → 同样不重复调用，因此不会产生第二份业务结果。

> 演示失败路径：任务原文包含 `[SIMULATE_MODEL_FAILURE]` 时，**第一次**解析会强制失败（模拟外部模型服务故障）；同一任务重试即可成功。这是可逆、局部、不改动任何共享配置的测试开关。

---

## 7. 安装与配置

前提：本机 Xpert 平台已启动（API 与 Cloud UI 可用），已登录 `SUPER_ADMIN`。

```bash
# 1) 构建（会构建 shadcn-ui、打包远程组件、编译服务端）
cd community
corepack pnpm --filter @xpert-ai/plugin-listing-assistant build

# 2) 部署到本地平台（插件声明为 tenant 级别）
cd <xpert-platform-root>
corepack pnpm plugin:deploy:local \
  --plugin-dir <plugin-repo>/community/apps/listing-assistant \
  --scope tenant \
  --tenant-id <tenant-id> \
  --api-url http://localhost:3000/api
```

- 认证复用宿主 CLI 的 `XPERT_USERNAME` / `XPERT_PASSWORD` 环境变量，不要在命令参数或仓库里写凭证。
- 部署完成后按提示**重启 API**，插件才会加载。
- 模型：在平台的「模型提供商」中配置一个可用连接并设为 Primary 默认模型；助手模板内置 `deepseek-flash`，其他环境创建助手时请选择自己的可用模型。
- 助手模板：平台「助手模板」目录中会出现「批量上架助手」，基于模板创建并发布助手后即可在对话页打开工作台。

---

## 8. 验证记录

### 基线版本

| 仓库 | 基线 SHA |
|---|---|
| `xpert-ai/xpert` | `16633312fcf4c29c328ec19e7f5d496c88975bd0` |
| `xpert-ai/xpert-plugins` | `dfad5423205811b3251628ee9bf59a79a4bcbd87` |

实测环境：Ubuntu 22.04 / Node `v22.20.0` / pnpm `8.15.8`（community 工作区）/ `@xpert-ai/plugin-sdk` `3.31.0` / Cloud UI `3.31.0`。

### 已验证（本机真实运行）

| 验收项 | 结果 |
|---|---|
| 构建 | `tsc`、esbuild 远程组件、远程类型检查均通过 |
| 单元测试 | `node:test` 6 条（字段标记、缺失/不确定、草稿归一化、人工确认清除标记、批量分隔、单条不拆分）全部通过 |
| 并发认领 | 同任务同时两个解析请求：一个成功、一个被拒，仅 1 条成功运行记录 |
| 批量创建 | 两条文案以 `---` 分隔，一次创建出 2 条任务 |
| 错误码本地化 | 模拟失败返回 `AI_SIMULATED_FAILURE`，界面按语言显示中文提示 |
| harness 生命周期 | `plugin-dev-harness` 通过：register → Nest 初始化 → onStart → bootstrap → destroy → onStop |
| 插件安装与加载 | `loadStatus: loaded`，`currentVersion: 0.1.0` |
| 实体自动建表 | 4 张 `plugin_listing_assistant_*` 表已创建 |
| 助手模板 | 模板目录可见，可基于模板创建并发布助手（v1） |
| 工具与视图绑定 | 助手图中可见 `ListingAssistantMiddleware` 与 4 个工具；Workbench 视图出现在两个槽位 |
| 真实模型调用 | 通过平台默认模型完成抽取，返回合法结构化结果 |
| 保存与恢复 | 保存后状态 `saved`；刷新/重进应用后任务与草稿仍在（数据库可查） |
| 空状态 | 无任务时展示引导与新建入口 |
| 失败与重试 | 首次失败展示原因 → 同任务重试成功；AI 运行记录 `attempt 1 failed / attempt 2 succeeded`，任务数不增加 |
| 幂等 | 已保存任务再次解析返回「已有解析结果」，仅 1 条成功运行记录 |

### 未验证 / 已知限制

- NsJail 沙箱在本机未启用（本应用不依赖沙箱）。
- 仅以超级管理员单账号验证；多用户/组织权限只保证了数据按租户与组织隔离。
- 未做图片 OCR、真实内容审核与真实商品库对接。

---

## 9. 面试演示脚本（约 3 分钟）

1. 打开「批量上架助手」对话 → 点右上角「打开视图」进入批量上架工作台（空状态 → 新建任务）。
2. 粘贴一段供货文案 → 创建任务 → **AI 解析**；指出哪些字段带「AI 补全」、哪些被标「缺失 / 待确认」。
3. 手工改一个字段 → **保存草稿** → 展示状态变为「已保存」。
4. **刷新页面 / 重新打开工作台** → 任务还在，状态仍是已保存。
5. 新建一个带 `[SIMULATE_MODEL_FAILURE]` 的任务 → **AI 解析失败**，展示错误原因 → **重试**成功。
6. 强调：重试是同一个任务（第 2 次运行），没有产生第二条任务 / 第二份业务结果。

> 详细技术追问与标准回答见 [docs/interview-qa.md](docs/interview-qa.md)。

---

## 10. 许可证

AGPL-3.0（与本仓库一致）。
