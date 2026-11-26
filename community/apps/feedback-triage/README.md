# 客户反馈分诊工作台

一线客服收到客户反馈后，经常要把聊天原文抄进工单，再给研发解释问题和判断依据。这个 Xpert 应用保留客户原话，让模型提出分类、摘要和下一步，并要求它逐字引用依据。客服在同一张工单中核对、纠正类型并确认，之后可以按原记录重新打开。

## 一条反馈怎样完成分诊

1. 在助手工作台打开「新建反馈」，输入 10 到 2400 个字符。演示可输入「我在订单页点击导出后，页面一直转圈。刷新后重试了两次，还是没有下载到 CSV。」
2. 点击「保存并生成建议」。客户端先创建工单，服务端再调用模型。即使推理失败，客户原话和工单编号仍可恢复。
3. 核对问题摘要、反馈类型、引用和建议下一步。引用必须是原文中的连续片段。客服可以更正分类，再点击「确认并保存建议」。
4. 重新进入工作台，打开同一张已确认的工单。在对话中输入 `/inbox` 或问「查看我最近提交的反馈」。助手调用收件箱工具，按实际记录展示短编号、原文、状态和人工确认的分类。
5. 模型不可用时，工单显示失败原因。恢复模型后，在同一张工单点击「重试分诊」。系统只增加尝试次数。

界面原型围绕两栏布局。左栏列出最近工单及状态，右栏在录入表单、原文与待审建议、已确认结果之间切换。窄屏采用单栏。助手可以读取或分析工单，人工确认操作由工作台提供。首版只处理文本反馈，省去附件识别、对外回复和自动派单。

```mermaid
flowchart LR
    Input[客服录入原话] --> Draft[保存工单]
    Draft --> AI[模型生成建议并引用原话]
    AI -->|引用和结构通过校验| Review[客服核对或更正分类]
    AI -->|推理失败或输出无效| Retry[保留工单和失败原因]
    Retry -->|重试同一张工单| AI
    Review --> Save[保存人工确认结果]
    Save --> Read[在工作台或助手对话中复查]
```

## 环境与安装

本项目基于 [Xpert 开源宿主](https://github.com/xpert-ai/xpert/tree/518b89537dc9a17a8c28165e95d942c6bcd51bd9) 和 [插件仓库](https://github.com/xpert-ai/xpert-plugins/tree/7f12f3525464454b546f1df133b051255e121d8d)。在插件仓库根目录执行下列命令。本次开发使用 Node.js 24，community 使用 pnpm 8.15.8。其他工作区的 pnpm 版本由 Corepack 按各自清单选择。

```sh
cd community
corepack pnpm --filter @community/apps-feedback-triage... --filter @community/root install --frozen-lockfile
corepack pnpm --filter @xpert-ai/plugin-shadcn-ui build
corepack pnpm --filter @community/apps-feedback-triage build
corepack pnpm --filter @community/apps-feedback-triage typecheck
corepack pnpm --filter @community/apps-feedback-triage test
cd apps/feedback-triage
npm pack --pack-destination /tmp
```

给 Xpert API 的运行环境设置以下变量。模型端点须允许服务端访问，支持 Chat Completions 和 JSON Schema 结构化输出。演示环境使用兼容工具调用的专用开源模型；可以为助手对话和分诊任务配置同一模型。

```dotenv
FEEDBACK_TRIAGE_MODEL_BASE_URL=http://feedback-model:8080/v1
FEEDBACK_TRIAGE_MODEL_NAME=feedback-qwen3
# 仅当模型服务需要认证时设置
# FEEDBACK_TRIAGE_MODEL_API_KEY=
```

演示使用 Qwen3.5-0.8B 的 Unsloth Q6_K 量化权重，推理引擎为 llama.cpp b12723。模型按 Apache-2.0 授权，推理引擎按 MIT 授权。服务使用 8192 token 上下文和一个推理槽，生成用 2 个线程，处理提示用 3 个线程，容器最多使用 2.4 核。192 MiB 的内存缓存保留重复的提示前缀。API 只在宿主专用容器网络内开放。平台模型连接使用 chat 协议，开启 tool calling 和流式工具调用，`feedback-qwen3` 是部署别名。[原始模型](https://huggingface.co/Qwen/Qwen3.5-0.8B) · [量化权重](https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/tree/6ab461498e2023f6e3c1baea90a8f0fe38ab64d0) · [推理引擎](https://github.com/ggml-org/llama.cpp/releases/tag/b12723)

复现时将 Q6_K 文件挂载为 `/models/feedback.gguf`，其 SHA-256 为 `8408c5c222111cec253682b49eece2a02ed641ded68490001ec4ee160e71098e`。在与 Xpert API 共享私有网络的模型容器中运行以下命令。

```sh
llama-server --model /models/feedback.gguf --alias feedback-qwen3 \
  --host 0.0.0.0 --port 8080 --ctx-size 8192 --parallel 1 \
  --threads 2 --threads-batch 3 --batch-size 256 --ubatch-size 128 \
  --cache-ram 192 --ctx-checkpoints 3 --checkpoint-min-step 512 \
  --flash-attn off --jinja --reasoning off --no-webui
```

1. 准备带 PostgreSQL、Redis 和管理员账号的 Xpert 开源宿主。在平台「模型供应商」中添加 OpenAI-compatible 连接，配置模型端点、模型名称、工具调用能力，设置可用的默认对话模型。
2. 使用平台管理员登录，按系统级插件安装。宿主的 `plugin:deploy:archive` 支持上传打包文件，适合测试平台。定义的 Xpert 凭证及组织信息保存在部署环境。需要通过 SSH 转发访问远端 API 时，可以使用本机回环地址作为部署地址。
3. 按宿主提示完成插件的 schema-sync 和 API 重启，在安装验证通过后用管理员切换到目标组织。在应用目录初始化「客户反馈分诊」，平台使用随包的「客户反馈分诊助手」模板在专用工作空间创建并发布助手。也可以从模板详情进入 Studio，查看主助手与中间件之间的连接。
4. 让客服账号获得这个助手的使用权限，登录后打开助手对话，再从工作台菜单打开「客户反馈分诊」。演示使用独立的普通客服账号办理工单，管理员用来查看 Studio 画布。

从宿主仓库根目录执行归档发布与校验。按 `node tools/scripts/deploy-archive-plugin.mjs --help` 设置 API、租户和管理员认证。校验时将 `XPERT_REPLICA_URLS` 设为实际服务副本的受信任直连地址数组。

```sh
corepack pnpm plugin:deploy:archive publish /tmp/community-apps-feedback-triage-0.1.4.tgz
corepack pnpm plugin:deploy:archive verify /tmp/community-apps-feedback-triage-0.1.4.tgz
```

## 开发者复验

在 `community` 目录执行 `corepack pnpm --filter @community/apps-feedback-triage test:workbench`。此测试用 Chrome 加载已构建的 iframe 与真实脚本，在可控的宿主消息和模型响应下验证输入、失败重试、人工确认及刷新恢复。默认使用本机 Chrome，也可用 `CHROMIUM_PATH` 指定 Chromium 可执行文件。

在插件仓库根目录执行官方生命周期检查。该步骤独立于工作台测试，其中的数据库和宿主能力由 Harness 提供测试替身。

```sh
cd plugin-dev-harness
corepack pnpm install --ignore-workspace --frozen-lockfile --ignore-scripts
./node_modules/.bin/tsc -p tsconfig.lib.json
cd ..
node plugin-dev-harness/dist/index.js --workspace ./community --plugin @community/apps-feedback-triage
```

## 实际运行截图

以下截图来自同一套 Xpert 开源测试平台。反馈内容是演示用的虚构样本，由本地模型实际处理。

**模板与画布。** 在应用目录打开插件提供的助手模板。发布后的 Studio 画布显示主助手已连接「客户反馈分诊」中间件，节点列出了 `feedback_inbox` 和 `feedback_analyze`。

![Xpert 模板详情展示客户反馈分诊助手及其指令](docs/images/01-assistant-template.png)

![已发布的画布包含助手、反馈中间件和两个业务工具](docs/images/02-studio-canvas.png)

**输入和 AI 建议。** 客户说报表下载按钮很难找，最后还是下载成功了。模型将这条反馈归为功能需求，摘要也误写成下载失败。把客户原话和引用放在建议旁边，可以直接核对这两处偏差。

![普通客服在真实工作台录入下载按钮难找的客户原话](docs/images/03-feedback-input.png)

![工作台显示真实模型生成的分类、摘要、原文引用和下一步](docs/images/04-ai-review.png)

<details>
<summary>输入太短时的界面反馈</summary>

只填两个字并提交后，输入框就地提示需要 10 到 2400 个字符。浏览器没有发送创建请求，列表维持两张工单。补全同一输入框后可继续。

![真实表单提示输入长度不足](docs/images/10-input-validation.png)

</details>

**确认与恢复。** 客服把最终分类从「功能需求」改成「使用体验」，刷新后重新打开工单 `c56c42ac`。模型原建议和人工最终分类都保留。当前版本允许更正分类，模型摘要以原样保留。

![同一工单刷新后仍显示人工最终分类和 AI 原建议](docs/images/05-confirmed-restored.png)

**失败与重试。** 在测试服务器停下专用模型后创建另一张工单，工作台保留原话、编号和失败原因。恢复服务后点击「重试分诊」，对照两图中的编号与分析次数。

![模型服务中断后显示原因和同一工单的重试按钮](docs/images/06-model-unavailable.png)

![服务恢复后同一工单第二次分析成功](docs/images/07-retry-same-ticket.png)

**对话和工具调用。** 同一位客服在对话中查询近期工单。助手实际调用一次 `feedback_inbox`，随后给出三条已确认记录的编号、问题和分类。清单中包含上面人工更正的工单，最终分类为 `usability`（使用体验）。这份清单直接使用工具返回的记录，展示时不再经过模型改写。

![真实助手对话按工具结果列出近期工单](docs/images/08-chat-with-tool.png)

![在 Xpert 对话里展开反馈收件箱的工具执行记录](docs/images/09-tool-call.png)

## 验收结果

| 层次 | 执行环境与操作 | 实际结果 |
| --- | --- | --- |
| 构建与业务规则 | TypeScript 类型检查、服务端与视图构建、29 项 Node 测试，使用内存 SQL 数据库和可控模型响应 | 覆盖重复提交、并发领用、过期重试、人工更正、重新打开数据库、租户/组织/用户隔离，以及只读请求和明确要求分诊的边界。 |
| 生命周期与浏览器夹具 | 官方 `plugin-dev-harness` 加载、初始化和关闭插件；Chrome 加载打包后的远程组件 | 加载和关闭成功。浏览器完成了输入校验、丢失创建回执后重试、失败后恢复、人工修改分类与刷新回读。 |
| 平台真实使用 | Xpert 开源版、PostgreSQL、专用 Qwen、普通客服账号 | 从工作台创建工单并取得含原文引用的建议，确认后刷新重开成功。停止模型服务后另一张工单显示失败，恢复服务后同一编号的尝试次数由 1 变为 2，数据库回读为已确认。 |
| 真实权限 | 同组织的两个独立登录账号；用第二人的会话查询列表，并尝试分析及确认第一人的工单 | 列表中没有对方工单，两次写操作均返回 `not_found`，对方工单未被改动。跨组织、跨租户隔离由服务测试覆盖。 |
| 助手工具 | 普通客服从 ChatKit 发出查询，核对工具记录与最终答复 | 一次 `feedback_inbox` 调用成功。中英文清单和 `/inbox` 均只调用一次工具。三条短编号、原文、已确认状态与人工分类逐条匹配工作台，客服可以重新打开保存的对话。 |

测试平台运行官方 main 基线对应的 Linux amd64 Web 与 API，宿主 SDK / contracts 为 3.38.1。API 的大体积只读文件在演示服务器使用 SquashFS 挂载，仍使用该版本的官方入口与 Node 20.20.2。工作区按仓库依赖使用 SDK / contracts 3.26.2 编译。演示部署使用插件 0.1.4，已发布助手 v3，执行上限为 32 步。本次给演示宿主的浏览器资源做了单独分包与缓存。其他宿主可直接安装此插件。没有验证生产并发容量或其他云模型供应商。

在同一演示站的普通账号上，原版两次近期工单查询的宿主执行记录约 47–49 秒。更新后，从点击发送到清单全部可见，API 重启后的第一条中文查询约 3.2 秒，新会话英文查询约 2.5 秒，`/inbox` 约 2.1 秒。首次要求解释分诊依据的开放问题使用真实模型，约 25 秒。同一会话再问一个不同的简短问题，约 5.8 秒。这里记录的是单用户实测。

## 数据与工具

工单持久化在宿主 PostgreSQL。服务端从宿主上下文取得租户、组织和操作用户，每次查询和状态更新都带上这三项条件。入库时为同一用户和提交请求建立唯一约束。模型请求在事务外运行；通过工单状态和尝试编号领用任务，服务端可清理过期的处理中状态，同时阻止迟到的模型回复覆盖较新的结果。

| 工具 | 谁使用 | 业务结果 |
| --- | --- | --- |
| `feedback_inbox` | 助手 | 读取当前用户最近十张工单的编号、原话摘录、状态和人工确认分类 |
| `feedback_analyze` | 助手 | 依客服请求分析或重试一张工单。客服指定编号时会核对目标，短编号须在本人可见工单中唯一。 |
| 工作台确认操作 | 客服 | 核对原话和建议，保存最终类型和确认状态 |

模型能逐字引用原句，但仍可能选错句子或误分类。客服应核实引用是否真的支持摘要。模型不可用、输出不合约或引用脱离原文时，工单保留原始输入并提供重试。

### 插件隐私说明

宿主数据库保存客服主动输入的反馈、模型建议、人工分类、处理状态、时间与请求编号，并保存宿主提供的租户、组织和用户 ID 以限定访问范围。自由文本可能包含客户姓名、联系方式等个人信息，演示可直接使用本 README 中的虚构样本。

分诊时，服务端把该条反馈发送到管理员配置的模型端点。明确的中英文清单请求和 `/inbox` 由宿主直接调用已授权的收件箱工具，按结果生成答复。若要求只看用某种语言提交的工单，收件箱会说明工单没有记录提交语言，并给出本次可核对的原文摘录数量。要求用中文或英文显示清单时，答复使用指定语言。概括原文、比较或进一步分析需要调用模型，相关工单的摘录和状态可能进入模型上下文。演示使用同一台服务器的专用模型。配置外部模型服务时，相应的推理数据也会发往该服务。插件没有独立的分析追踪服务，也不会向模型提交平台登录凭证。工单随宿主数据库持久化，本版本没有自动清理功能，保留期限和删除由部署方按其数据管理流程执行。[数据实体](./src/ticket.entity.ts) · [模型调用](./src/model.ts) · [助手工具](./src/middleware.ts)

## 来源与开发过程

插件独立实现了反馈状态、三层数据隔离、模型输出校验、人工确认流程和界面。插件注册、工作台能力声明、助手模板和沙箱桥接参考同仓 Dockyard 及官方插件 SDK。React 控件、主题和多语言适配来自仓库内的 `@xpert-ai/plugin-shadcn-ui`。本包随上游采用 AGPL-3.0；第三方依赖按各自包的许可使用。模型权重由部署端提供。[Dockyard](../dockyard) · [共享 UI](../../../packages/shadcn-ui)

开发使用 Codex（GPT-6 系列）辅助阅读宿主代码、实现和审查。最初给 AI 的任务是让客服能核对每条建议的出处，并在模型中断时找回已提交的原话。以下是实现中影响结果的决策。

- 用同一份反馈先保存、后推理。测试模拟「数据库已写入、前端没有收到响应」后，以同一请求编号重试，检查始终只有一张工单。
- 工作台表单首次在浏览器夹具中无法提交。对照宿主渲染器发现测试 iframe 少了 `allow-forms`，补齐宿主实际使用的沙箱权限后，表单测试通过。
- 生命周期测试可以启动插件，第一次独立归档安装却触发了 Nest 的 `DataSource` 注入错误。对比宿主和插件实际解析出的模块后，改用宿主链接的 SDK 查找 ORM 适配器，补上模拟归档隔离的回归测试，并在真实宿主重新安装。审查还发现聊天工具可能返回旧的模型分类，已改为同时返回人工确认的分类。
- 用六条中文样本直接调用专用模型。六次引用都能在原文找到，四次分类符合预期。「下载按钮的位置太隐蔽」被标为功能请求，另一条表扬也被归入功能请求。因此工作台保留模型原建议，允许客服另存最终分类。这组六例仅用于发现具体错误。下一步值得用人工确认样本扩大对分类和引用相关性的评估。
