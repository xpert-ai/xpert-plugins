# 客服工单分诊

客服收到报障或咨询时，需要从来信中摘取关键信息，再决定工单归类和处理顺序。本插件用 Xpert 助手生成摘要、类别和优先级建议，并保留来信原文与判断依据。客服在工作台复核、调整并确认。确认后的工单和模型原建议都可在下次打开工作台时查看。

## 界面与流程

```text
工单分诊工作台
┌─────────────────────┬──────────────────────────┐
│ 主题                 │ 当前工单和原始来信         │
│ 客户来信             │ AI 摘要、引用和判断理由    │
│ 保存工单             │ 可修改类别、优先级、摘要   │
│ 我的工单与当前状态   │ 确认并保存 / 失败后重试   │
└─────────────────────┴──────────────────────────┘
Xpert 助手对话显示模型处理与工具调用。
```

1. 在助手工作台打开 **工单分诊**，使用 [虚构样例](examples/ticket.txt) 新建工单。
2. 选择 **交给 AI 分诊**。工作台将该工单的处理请求发送给当前助手。助手通过中间件读取来信，再把建议写回同一工单。
3. 在 **待确认** 状态查看来信、原文引用和判断理由。可修改摘要、类别和优先级，然后选择 **确认并保存**。
4. 刷新页面或重新打开工作台，选中原工单，查看 AI 建议和最终确认结果。
5. 如果模型调用失败或助手提前结束，工作台显示失败原因。恢复模型后在同一工单选择 **重试分诊**。

数据通过宿主 PostgreSQL 保存，按租户、组织、工作空间、用户和助手隔离。每次尝试都有独立标识和两分钟期限，旧尝试不能覆盖新尝试或已确认的结果。所有状态更新验证记录版本。本范围覆盖文字工单和最近 50 条记录，暂未接入客服系统、附件处理或团队队列。

## 构建与部署

使用 Xpert 开源版和插件仓库各自声明的 Node.js 与 pnpm 环境。开发基线如下。

| 仓库 | 开发开始时的 main SHA |
| --- | --- |
| xpert-ai/xpert | `c856a31cf2f060006c8e689d7adaf74946792cfa` |
| xpert-ai/xpert-plugins | `7f12f3525464454b546f1df133b051255e121d8d` |

从插件仓库根目录运行下列命令。

```sh
cd community
corepack pnpm --filter @community/apps-support-ticket-triage... install --frozen-lockfile
corepack pnpm --filter @xpert-ai/plugin-shadcn-ui build
corepack pnpm --filter @community/apps-support-ticket-triage typecheck
corepack pnpm --filter @community/apps-support-ticket-triage test
corepack pnpm --filter @community/apps-support-ticket-triage build
```

按 [Xpert 本地源代码指南](https://docs.xpertai.cn/zh-Hans/ai/getting-started/community/local-source-code) 启动宿主。将插件仓库加入宿主的本地工作区允许列表，使用有对应安装权限的测试账号。下面是宿主和部署 CLI 的环境变量示例。真实凭证放在本地忽略文件或平台凭证库。

```dotenv
# Xpert host
PLUGIN_WORKSPACE_ROOTS=/absolute/path/to/xpert-plugins
# Local deployment CLI
XPERT_API_URL=http://localhost:3000
XPERT_TENANT_ID=<test-tenant-id>
XPERT_TOKEN=<test-admin-login-token>
```

从平台仓库根目录执行。安装范围为 tenant，因为插件注册了数据库实体。

```sh
corepack pnpm plugin:deploy:local --help
corepack pnpm plugin:deploy:local \
  --plugin-dir /absolute/path/to/xpert-plugins/community/apps/support-ticket-triage \
  --scope tenant --api-url "$XPERT_API_URL"
```

按部署结果重启平台并验证插件已加载。在 Xpert 模型供应商设置中安装或启用 DeepSeek，填写凭证并选用支持工具调用的模型，例如 `deepseek-flash`。在平台从 **客服工单分诊** 模板创建助手，检查画布上已连接 **工单读取与建议保存** 中间件，选择 DeepSeek 作为助手模型后发布，再在该助手的对话中打开工作台。工作台由中间件的 Feature 激活，不需要单独配置 API Key。

## 验收

从插件仓库根目录执行生命周期检查。

```sh
cd plugin-dev-harness
corepack pnpm install --ignore-workspace --frozen-lockfile --ignore-scripts
corepack pnpm build
cd ..
node plugin-dev-harness/dist/index.js --workspace ./community \
  --plugin @community/apps-support-ticket-triage
```

业务测试使用虚构来信、内存 SQL 数据库和预设建议，覆盖确认、重新读取、无结果、输入校验、权限、失败重试、超时及并发。平台验收需要启用真实 DeepSeek，按上述五步验收并记录结果。用独立的测试助手变更模型配置触发一次失败，再恢复可用模型并重试原工单。

| 检查 | 结果 |
| --- | --- |
| 服务端和远程工作台类型检查 | 通过 |
| 工单业务测试 | 6 项通过 |
| 插件构建和打包 | 通过，包含服务入口、助手 YAML 和工作台 JS/CSS |
| 官方生命周期工具 | 通过，使用工具提供的数据库和平台模拟对象 |
| Xpert 实际工作台、DeepSeek 调用和运行截图 | 待平台联调 |

## 复用与 AI 协作

插件采用 AGPL-3.0。参考同仓库 Dockyard 的助手模板、租户工作台、表命名和中间件注册方式，以及 EV Motor Lifecycle 的远程 React 接入方式。界面复用仓库的 `@xpert-ai/plugin-shadcn-ui` 组件及主题适配。工单状态、处理尝试、引用校验和人工确认流程为本插件实现。

开发使用 Codex 阅读 SDK 和相邻插件、生成实现并运行检查。设计选择包括用平台原生对话发送分诊请求、用记录版本拦截竞争写入，以及保留模型建议作为人工复核依据。
