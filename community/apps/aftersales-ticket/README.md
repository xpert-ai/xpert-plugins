# 售后工单处理工作台

面向一线客服：录入客户问题 → AI 分类、优先级、待补充信息及回复草稿 → 人工修改确认 → 刷新查看持久化结果。确认只保存，不向客户发送消息或执行退款。

## 当前状态（2026-11-28）

前一版在本地源码运行的 Xpert（`c856a31c`）上完成主流程演示，以下结果来自操作者记录与真实平台截图：

- 插件安装、加载、注册成功，工单表由宿主 schema sync 创建。
- Workbench 视图在助手左侧菜单出现，可新建、列表、查看与确认。
- 五个工具全部可用，中间件配置页正常显示。
- 真实 DeepSeek（`deepseek-v4-flash`）完成一次完整分析并保存结果。
- 刷新后工单与最终回复仍在，状态从 `awaiting_review` 变为 `confirmed`。
- 失败重试以修改测试记录的 `updatedAt` 模拟超时，随后成功接管为 `attempt 2`。未实测自然等待五分钟；不是定时自动释放。

2026-11-28 收尾版已修复双应用模板发现、确认与发送语义、超时接管条件；构建和 17 项自动化测试通过，生命周期 harness 使用 ORM mocks。模型工具返回明确的 `deliveryStatus: not_sent`（工单 DTO）和不发送说明。现有截图来自收尾修复前，修复后的真实模型措辞和模板创建仍待页面复验。

当前平台原生表格的动作执行器不会呈现 inputSchema 表单，因此本插件使用自带 React iframe，通过平台桥接进行查询、写入和发起助手分析，不修改宿主 UI。

## 运行截图

以下截图均来自本地真实运行实例（平台 `c856a31c`，插件 `feat/aftersales-ticket`）。

### 工作台列表

![售后工单工作台](docs/images/01-workbench.png)

### 工单详情（AI 分析结果 + 人工确认后的回复）

![工单详情](docs/images/02-ticket-detail.png)

### 失败重试（`analyzing` 超时后 `attempt 2` 接管）

![失败重试](docs/images/03-failure-retry.jpg)

该历史截图中的“另一工单已发送”是模型的错误表述，实际应用没有发送能力。保留原图作为已知问题证据；本轮已强化模板及工具返回约束，不把旧截图当作修复后验证。

### 助手画布（中间件节点与工具）

![助手画布](docs/images/04-agent-canvas.png)

### 中间件配置（五个工具）

![中间件配置](docs/images/05-middleware-tools.png)

## 版本与目录

- 插件上游基线：`7f12f3525464454b546f1df133b051255e121d8d`，分支 `feat/aftersales-ticket`。
- 升级后的测试宿主：`c856a31cf2f060006c8e689d7adaf74946792cfa`；旧宿主缺少 ORM 共享依赖链接支持。
- Node 22.23.5，community pnpm 8.15.8，平台 pnpm 10.24.0。
- Contracts / Plugin SDK：3.38.1。沿用官方样例的 LangChain Core 0.3.72；安装时 chatkit-types 的 Core ^1 peer 警告仍存在，旧版已完成一次真实模型流程；本轮修复后的模型输出仍待复验。
- `src/ticket.entity.ts`：插件实体，命名空间 `aftersales_ticket`。
- `src/ticket.service.ts`：按租户、组织、当前用户隔离的持久化与条件更新。
- `src/ticket.middleware.ts`：list/get/begin/save/failure 五个工具，没有人工确认工具。
- `src/ticket.view.ts`、`remote/`：工作台数据及动作、React 界面、中英文目录。
- `src/ticket.templates.ts`：可导入助手 DSL；没有硬编码模型、凭证或组织。

## 构建与验证

在 community 目录运行：

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @xpert-ai/plugin-aftersales-ticket test
```

测试会先构建共享 UI、插件 TypeScript 和浏览器资源，避免测试旧 dist。

在插件仓库根目录运行已构建的生命周期工具：

```sh
node plugin-dev-harness/dist/index.js \
  --workspace ./community/apps/aftersales-ticket \
  --plugin @xpert-ai/plugin-aftersales-ticket
```

需要时按 `plugin-dev-harness/README.md` 单独安装/构建 harness。它的 ORM mocks 不代表真实数据库测试。

## 安装与使用

在已准备登录环境变量的终端中，从支持此插件的 Xpert 宿主根目录执行：

```sh
corepack pnpm plugin:deploy:local \
  --plugin-dir /absolute/path/to/xpert-plugins/community/apps/aftersales-ticket \
  --scope tenant --api-url http://localhost:3002 --no-keychain
```

使用正常登录获得的身份；不要从数据库拼接 JWT。凭证不得写入仓库。本插件安装级别为 tenant，工单读写仍必须具有可信 organizationId 和当前 userId，不存在全局数据回退。

本次实体新增可空 `errorCode` 字段，已有列不删除不重命名。正常安装/刷新由宿主的插件 schema sync 处理；不要绕过宿主直接改表。升级有业务数据的实例应先正常备份。按部署返回的 restartRequired 决定是否需要重启，再核查 readiness、插件状态和新增列。

1. 从“售后工单助手”模板创建助手，选择有工具调用能力的已配置模型（本项目计划使用 DeepSeek），检查中间件连接并发布。
2. 打开该助手的售后工单工作台，新建工单。
3. 点击“查看”→“AI 分析／重试”，通过 `assistant.chat.send_message` 发起分析。缺少该宿主命令时会报错，可在同一助手对话中明确指定工单。
4. 分析完成后刷新工作台，查看分类、优先级、待补充信息和回复草稿。
5. 点击“修改并确认回复”，编辑后确认保存。刷新验证最终回复仍在。
6. 模型失败而工单停在“分析中”时，先标记分析中断，再重试同一工单。人工中断不取消平台模型运行，但会拒绝该尝试随后返回的结果。

## 一致性与限制

每次分析使用递增 attempt；更新条件包含可信 scope、工单 ID、状态和 attempt。旧结果不能覆盖新尝试，重复确认不能覆盖已保存回复。新建对话框生成固定 UUID；一次提交的超时重试复用该 ID，服务端 insert 遇重复时仅返回同范围同内容记录，不覆盖已有工单。关闭对话框重新新建视为新工单。

所有数据请求经平台桥接；iframe 不保存令牌、不使用 Web Storage。只接受父窗口发来的协议消息，并校验实例及 scopeRevision。语言切换保留正在编辑的草稿。错误或超时保留草稿，提示先刷新。

当前不实现附件、分派、自动通知、自动退款和跨用户共享。已有 jsdom 测试及旧版真实浏览器主流程截图；跨组织/跨用户真实接口隔离、真实数据库并发、键盘/读屏/移动端尚未完整验证。截图中的五个工具开关证明配置可见，不代表五个工具均已实际调用。

## 复用与交付

骨架来自 `community/scripts/create-package.mjs`；中间件、Feature 激活、模板及 React iframe 入口参考 `community/apps/procurement-quote-comparison`；共享组件使用 `packages/shadcn-ui`。许可证 AGPL-3.0。没有复制采购业务逻辑。

招聘方示例与固定 SHA 尚未提供。真实平台的对话、工作台、画布/中间件及异常恢复截图见上文；展开的工具调用输入/输出记录仍待补充。本次提交向上游 `xpert-ai/xpert-plugins` 的 `main` 发起 PR，不要求合并。

## 复现与协作记录

详见 [验证记录](docs/verification.mdx)、[部署说明](docs/deployment.md) 和 [AI 协作与产品设计](docs/development-notes.md)。
