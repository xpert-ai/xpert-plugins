# 会后行动项核对与确认工作台

将会议文本转换为带原文依据的行动项草稿，由整理者编辑、保存并最终确认。确认只表示内容经过核对，不派发任务，也不跟踪执行进度。

首版实现：一个主 Agent、两个业务工具、一个工作台、会议记录与分析尝试两张表。支持后台分析、历史查看、依据定位、人工增删改、保存前撤销最近一次移除、直接确认最新编辑，以及同一记录手动重试。确认后只读。

**0.1.5 新增插件内会话同步：提交提取后打开实际分析会话，历史记录打开最近一次尝试的会话。**新建空表单保留左侧原会话；未就绪或打开失败会显示提示，可以重试打开而不重新分析。保存/放弃/继续编辑保护覆盖插件自身导航。

0.1.4 的真实页面主流程 H01～H07、较旧记录刷新及真实模型失败重试已验证。测试记录与覆盖边界见[验证记录](docs/verification.md)；本次会话同步的安装验收记录见仓库 [聊天联动验证](../../../docs/meeting-action-review-chat-sync-validation.md)。

完整七项交付与待办见[交付清单](../../../docs/meeting-action-review-delivery-checklist.md)，本次差异与敏感信息检查见[交付审查记录](../../../docs/meeting-action-review-delivery-review.md)，面试操作见[演示脚本](docs/demo.md)。

## 环境和构建

- 目标宿主及 SDK/contracts：3.29.1；宿主核对提交 `83e0d4ce9462996e7a4c24517f63559bedf23b7e`。
- 插件开发基线：`60794aa72edb1fddffebd5e5d071619b8c29014b`，分支 `feat/meeting-action-review`。
- 在仓库 community 工作区使用 pnpm 8.15.8；共享 UI 引用本仓库 `packages/shadcn-ui`，不从其他 checkout 引入。

从仓库根目录执行：

```sh
pnpm -C community install --filter @xpert-ai/plugin-meeting-action-review --frozen-lockfile
pnpm -C community --filter @xpert-ai/plugin-meeting-action-review build
pnpm -C community --filter @xpert-ai/plugin-meeting-action-review test
pnpm -C community/apps/meeting-action-review pack
```

build 生成服务端 dist、远程界面和源摘要，检查两端类型与运行元数据。`verify:dist` 会拒绝过期产物；构建后再执行 UI 测试。不能把未构建源码目录压缩后当作运行产物。

## 在平台启用

1. 使用平台支持的原生插件安装流程安装构建产物，选择插件声明的 **tenant** 级作用域。实际业务仍要求组织上下文，数据仅创建者可访问。
2. 确认插件加载成功；若宿主返回 pending_restart，按部署工具提示重载并核实，不能把 staged 当作已运行。
3. 使用“会后行动项核对助手”模板创建 Assistant，选择可用、支持工具调用的模型。初始建议上下文至少 32K、输出预算 8K；不复制任何 API Key 到本插件。
4. 保留业务中间件，发布助手。先选择助手所属组织，再进入 `/chat/x/meeting-action-review-assistant/c`，点击聊天右上角“打开视图”，打开“行动项核对”工作台。
5. 新建会议、提交原文，等待结果后查看依据、编辑、保存或直接确认。普通聊天会引导使用工作台。

原文上限 10,000 个 Unicode 字符，清单总数上限 30 项；标题 120、事项 500、负责人和时间各 100、歧义提示 200。缺失负责人或时间可以留空，空清单也能确认。部署配置 `timeoutSeconds` 默认 120 秒；短会议已使用真实模型验证，最大输入与输出规模仍待专项测试。

配置示例：[工具登录/测试环境变量](docs/env.example)、[插件配置 JSON](docs/plugin-config.example.json)。示例不含凭据，插件不自动读取 env.example；使用网页安装时正常登录，在平台填写插件配置。模型密钥由平台模型提供器保存，不配置到插件。不要把实际 .env 或个人登录配置加入 Git。

实体由当前宿主的插件 schema preflight 建表，本插件不自行开启全局数据库同步。不要依靠手动执行不存在的 migrations 目录。卸载不主动删除业务记录。

## 验证

详见[验证记录与剩余检查](docs/verification.md)。数据库测试只接受显式 `MAR_TEST_DATABASE_URL`，且数据库名称必须是 `meeting_review_test`；测试会清空这个专用测试库，严禁指向业务库。

```sh
# 在插件目录，先 build
pnpm test
pnpm test:postgres  # 需在当前进程配置专用测试库 URL
pnpm test:ui        # 默认 Playwright Chromium；可配置 MAR_BROWSER_CHANNEL=chrome
```

生命周期检查遵循仓库 `plugin-dev-harness/README.md`，以 dist 入口启动并关闭插件。它使用基础设施 mock，不能代替真实平台验证。

## 实际平台截图

以下来自实际 Xpert 页面，使用专门标记的演示文本和平台已配置的 `deepseek/deepseek-v4-pro` 模型。

输入表单（提交前，尚未建立本次分析会话；下图仅展示右侧输入区域）。

![实际工作台输入会议文本](docs/images/live-input.png)

当前 0.1.5 的提取结果：左侧为对应分析回复，右侧为可编辑清单及展开的原文依据。

![左侧分析会话与右侧提取结果、原文依据同步](docs/images/live-host-review-sync.png)

当前 0.1.5 中打开已确认记录并整页刷新：左侧仍为该次 AI 初始结果，右侧为人工修改后的只读清单。示例左侧 2 项、右侧 3 项，是人工补充造成的正常差异。记录标题中的“0.1.4”是建档时的验收标签，不是当前运行插件版本。

![确认后刷新，左侧对应会话与右侧只读清单保持同步](docs/images/live-host-confirmed-sync.png)

0.1.5 提交后自动打开分析会话；下面展示左侧初始提取和右侧人工核对的关系。

![实际平台中的会话同步与人工编辑](docs/images/live-history-sync.png)

异常示例：专用停止试验后，任务达到固定截止时间而超时。原文仍可查看，并提供“重试提取”。截图只展示既有失败记录，采集时没有再次启动任务；恢复后同记录重试成功的另一受控用例见验证记录。

![实际平台超时提示、保留原文和重试入口](docs/images/live-failure-retained.png)

## 设计、来源与限制

- [产品与交互方案](../../../docs/meeting-action-review-plan.md)、[开发设计](../../../docs/meeting-action-review-development-design.md)、[数据库设计](../../../docs/meeting-action-review-database-design.md)。
- [使用步骤](docs/usage.mdx)、[验证记录](docs/verification.md)、[AI 协作说明](docs/ai-collaboration.md)。
- 布局参考仓库智能维保的列表/详情方式；桥接参考 Meetings 的宿主消息协议；交互组件复用仓库共享 shadcn UI，遵循仓库 AGPL-3.0 许可。业务逻辑为本插件独立实现。
- 不支持音频/文件上传、任务派发、外部集成、确认后修订、跨用户协作。未保存编辑仅在内存中，刷新不恢复。
- 左侧显示 AI 初始提取，人工编辑及确认以右侧为准；聊天不直接修改清单。原生停止/恢复保持平台行为，停止可能暂停实际分析，插件原有超时不延长。平台菜单、关闭或刷新页面的离开保护不由本插件接管。
- 已通过正常账号登录、原生归档安装和模板安装/发布流程完成部署；凭据保留在用户指定的仓库外配置中，没有复制到插件、日志或 Git。升级按宿主 pending_restart 要求重启 API，已有记录保留。
- 分析执行中的 API 重启/取消竞态、真实平台跨账号越权、复杂冲突与替换语义、最大规模输入仍有专项检查未执行，不能将主流程通过概括为 A01～A29 全部完成。
- 发布 SDK 的部分运行依赖由宿主提供，独立测试补充了 axios、short-unique-id、Nest CQRS 等开发依赖。workspace 的 chatkit-types / LangChain peer 提示需与宿主同版本一起评估，未擅自升级宿主的 LangChain。

后续优先补齐真实跨账号隔离、在途重启和复杂会议语义的可重复验收；其次再评估确认后修订的实际需求，不先扩展派发或多智能体功能。
