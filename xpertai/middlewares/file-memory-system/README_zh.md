# File Memory System 中间件

`@xpert-ai/plugin-file-memory` 是 Xpert 的内建文件记忆运行时插件。

它不是一个“只有读写文件”的小工具，而是一整套单插件记忆系统实现，负责把长期记忆落到文件系统里，并在 Agent 运行时完成四件事：

1. 在模型调用前注入可控的记忆索引、摘要和详情。
2. 提供显式工具，让模型按需精确读取或显式写入记忆。
3. 在回合结束后做异步写回，把值得长期保存的信息沉淀成 durable memory。
4. 用统一的文件布局、frontmatter、索引文件和预算控制，把记忆系统做成可解释、可治理、可调试的运行时组件。

这份文档重点讲技术实现，而不是只讲“怎么用”。

## 1. 设计目标

这个插件想解决的是：在不引入额外数据库表结构、不把记忆塞回 prompt 黑盒、也不把中间状态分散到多个插件的前提下，提供一个足够完整的长期记忆运行时。

它的关键设计目标有：

- 记忆内容可直接落盘，方便人工检查、迁移、备份、修复。
- 运行时召回可解释，不是“模型说召回了什么就是什么”。
- 模型能拿到有用的记忆，但又不会把整库记忆无上限塞进上下文。
- 显式工具读写与自动召回共用同一套底层文件与类型系统。
- 兼容旧的 `profile` / `qa` 两类长期记忆，同时引入更细的 `semanticKind`。
- 在宿主不改协议的约束下，尽量改善用户侧体验，例如 recall 事件展示、内部 selector 静默化等。

## 2. 包内核心角色

这套插件的入口和核心类分布如下：

- `src/index.ts`
  插件入口，声明插件元信息并导出 `FileMemoryPluginModule`。
- `src/lib/file-memory.module.ts`
  Nest module，注册所有 provider。
- `src/lib/file-memory.middleware.ts`
  运行时中间件主入口，负责 beforeAgent / wrapModelCall / wrapToolCall / afterAgent。
- `src/lib/file-memory.service.ts`
  底层记忆服务，负责文件读写、索引维护、搜索、召回构建、治理操作。
- `src/lib/recall-planner.ts`
  召回选择器，包含 lexical ranking、可选模型 selector、超时 fallback。
- `src/lib/file-memory.writeback-runner.ts`
  后台写回队列与 coalescing runner。
- `src/lib/file-memory.writeback.ts`
  单次写回决策逻辑，调用模型产出 `noop / upsert / archive`。
- `src/lib/layer-resolver.ts`
  决定 scope、layer、可见层和物理目录位置。
- `src/lib/path-policy.ts`
  决定开发态 / 生产态 / sandbox volume 下的根目录。
- `src/lib/memory-taxonomy.ts`
  语义分类、目录兼容、关键词推断、排序偏置。
- `src/lib/recall-event-message.ts`
  recall 事件的人类可读文案生成。

## 3. 总体架构

可以把它理解成下面这条链路：

```text
Agent Request
  -> FileMemorySystemMiddleware.beforeAgent
      -> 提取 query / recentTools / surfaced state
      -> 可选启动异步 recall prefetch
  -> FileMemorySystemMiddleware.wrapModelCall
      -> 注入记忆使用规则
      -> 注入 MEMORY.md 索引
      -> 注入摘要 digest
      -> 视模式与时机注入详情 detail
  -> 模型推理
      -> 可调用 search_recall_memories / write_memory
  -> FileMemorySystemMiddleware.wrapToolCall
      -> 记录 recent tools
      -> 更新 recall query，继续后台 prefetch
  -> FileMemorySystemMiddleware.afterAgent
      -> 可选后台 writeback
      -> 生成 durable memory 文件
```

从实现方式上说，它把“自动召回”和“显式检索工具”统一到了同一个底层文件服务之上，而不是两套独立系统。

## 4. 核心概念

### 4.1 Scope

在当前实现里，`resolveScope()` 需要一个 `xpertId`，并返回：

- `scopeType = 'xpert'`
- `scopeId = <xpertId>`
- 如果有 `workspaceId`，则把它记在 `parentScope` 里

一个很重要的实现细节是：

- 当前记忆的逻辑 scope 仍然是 `xpert`
- `workspaceId` 的作用主要是影响“根目录放在哪”
- 它并不会让系统自动去读取一套独立的 workspace 记忆层

也就是说，这个插件目前实现的是“xpert 级记忆”，只是当 xpert 属于某个 workspace 时，这些文件会落到 workspace 对应的物理根路径里。

### 4.2 Layer

每个 scope 下有两种 layer：

- `My Memory`
  `audience = 'user'`，并带 `ownerUserId`
- `Shared Memory`
  `audience = 'shared'`

`resolveVisibleLayers()` 的逻辑非常直接：

- 要读用户私有内容时，返回 `My Memory`
- 要读共享内容时，返回 `Shared Memory`
- 默认返回两层，且私有层排在前面

### 4.3 Kind 与 SemanticKind

存储层仍兼容旧的长期记忆类型：

- `profile`
- `qa`

但运行时会进一步映射到更细的语义分类：

- `user`
- `feedback`
- `project`
- `reference`

这两个概念的关系是：

- `kind` 主要服务于兼容旧模型与旧数据结构
- `semanticKind` 主要服务于目录组织、召回排序、写回决策和 prompt 语义

映射规则在 `memory-taxonomy.ts` 中定义：

- `user -> profile`
- `feedback / project / reference -> qa`

所以你会看到：

- 语义上已经细分成 4 类
- 但底层 `kind` 仍然只有两类

### 4.4 Status

支持三种状态：

- `active`
- `archived`
- `frozen`

当前行为是：

- `active`：正常参与 recall
- `archived`：默认不参与 recall，也不会出现在 managed index 列表里
- `frozen`：默认可见，但 `buildMemoryLifecycle()` 里并不把它视为 recall-eligible

当前治理动作只实现了 `archive`。

## 5. 文件系统布局

### 5.1 根路径策略

路径由 `FileMemoryPathPolicy` 决定。

它会根据环境推导 sandbox root：

- 开发态且未配置 `SANDBOX_VOLUME`
  使用本机 `~/data`
- 开发态且配置了 volume
  使用 `<volume>/<tenantId>`
- 生产态
  使用 `/sandbox/<tenantId>`

在此基础上：

- hosted root: `<sandboxRoot>/hosted`
- workspace root: `<sandboxRoot>/workspace/<workspaceId>`

但在“开发态 + 无 volume”的特殊布局下，hosted / workspace 最终都会折叠到同一个 `~/data` 根目录。

### 5.2 scope 目录

`FileMemoryLayerResolver.resolveScopeDirectory()` 会把 scope 路径组织成：

```text
<root>/.xpert/memory/xperts/<xpertId>
```

注意这里是 `xperts/<scopeId>`，因为当前 scopeType 是 `xpert`。

### 5.3 layer 目录

在 scope 目录下，再区分用户层与共享层：

```text
<scopeDir>/users/<userId>
<scopeDir>/shared
```

### 5.4 语义目录

每个 layer 目录下再分语义子目录：

```text
profile/
qa/
user/
feedback/
project/
reference/
```

这里同时保留了旧目录和新目录，原因是：

- 读路径时要兼容旧文件
- 写路径时优先按 `semanticKind` 选择目录

### 5.5 一个典型目录例子

如果是某个 workspace 下的 xpert，用户私有记忆文件可能长这样：

```text
<workspace-root>/.xpert/memory/xperts/<xpertId>/users/<userId>/user/喜欢肯德基-<uuid>.md
```

共享参考记忆可能长这样：

```text
<workspace-root>/.xpert/memory/xperts/<xpertId>/shared/reference/发布看板-<uuid>.md
```

## 6. 单个记忆文件格式

每条记忆都是一个 Markdown 文件，结构是：

```md
---
id: 3b9b0e0e-93b5-4fc4-a6dc-7760fca7292a
scopeType: xpert
scopeId: abc123
audience: user
ownerUserId: user-1
kind: profile
semanticKind: user
status: active
title: 用户姓名
summary: 用户姓名：张三
createdAt: 2026-04-04T02:26:32.440Z
updatedAt: 2026-04-04T02:26:32.440Z
createdBy: user-1
updatedBy: user-1
source: tool
sourceRef: conversation:xxx
tags:
  - 个人信息
  - 姓名
---

# 用户姓名

## 用户记忆
用户姓名：张三

## 补充上下文
只在当前账号范围内使用
```

这里有几个关键点：

- frontmatter 是真实元数据来源
- body 仍然保留面向人类阅读的 Markdown 结构
- `summary` 不是正文，它是召回摘要和索引 hook
- `content` / `context` 不是直接存的字段，而是由 body 解析出来

### 6.1 body 规范

`formatBody()` 会统一把正文写成：

- 一级标题：`# <title>`
- 二级语义标题：`## 用户记忆 / 反馈规则 / 项目信息 / 参考信息`
- 可选上下文段：`## 补充上下文`

`parseBody()` 读取时会：

- 去掉一级标题
- 提取 `## Context / 上下文 / 补充上下文`
- 剩下的正文部分作为 `content`

## 7. MEMORY.md 索引文件

每个 layer 目录下还会维护一个 `MEMORY.md`：

```text
<layerDir>/MEMORY.md
```

它是给运行时“轻量注入”用的，不是完整正文仓库。

### 7.1 managed 区段

系统只自动维护这两个标记之间的内容：

- `<!-- XPERT_FILE_MEMORY_MANAGED_START -->`
- `<!-- XPERT_FILE_MEMORY_MANAGED_END -->`

这样做的好处是：

- 你可以在索引文件里手写别的说明
- 系统刷新时不会把整份文件暴力覆盖

### 7.2 managed 内容长什么样

每条 active 记忆会渲染成一行：

```md
- [标题](relative/path.md) - summary 或标题
```

归档记忆不会出现在这个 managed 列表里。

### 7.3 为什么需要索引文件

索引文件的作用不是提供精确事实，而是给模型一个“低成本看全局”的入口：

- 让模型知道这个层里大概有哪些记忆
- 避免一开始就把全文塞进上下文
- 在 hybrid async 模式下，先注入索引和摘要，再视情况补详情

## 8. 底层服务：`XpertFileMemoryService`

这是整个插件最重要的底层服务。

### 8.1 搜索：`search()`

`search()` 会先把符合过滤条件的记录全部读出来，再做文本打分：

- `title` 权重最高
- `content`
- `context`
- `tags`
- `summary`
- 用户私有层还有小幅 layer boost
- 完整短语命中会有 exact hit 加成

这是显式工具 `search_recall_memories(query=...)` 和写回候选筛选的基础。

### 8.2 运行时入口：`readRuntimeEntrypoints()`

读取每个可见 layer 的 `MEMORY.md`，并包装成：

```xml
<memory_index layer="My Memory" audience="user">
...
</memory_index>
```

同时会做预算限制：

- 最多 200 行
- 最多 25,000 bytes

### 8.3 摘要 digest：`buildRuntimeSummaryDigest()`

这个方法不会读正文，而是只扫描 header，选出最相关的少量摘要项。

返回项里包含：

- `id`
- `canonicalRef`
- `title`
- `summary`
- `kind`
- `semanticKind`
- `relativePath`
- `mtimeMs`

这里的 `canonicalRef` 当前实现里其实就是 `id` 本身。

### 8.4 详情 recall：`buildRuntimeRecall()`

这是“自动补充正文”的主入口。

它会：

1. 读取所有可见 layer 的 entrypoints
2. 扫描 header manifest
3. 过滤掉不应该 recall 的状态
4. 调用 `recallPlanner.selectAsyncRecallHeaders()`
5. 只读取被选中的 detail
6. 再应用 turn/session 预算裁剪 detail

返回结果包含：

- `entrypoints`
- `headers`
- `selection`
- `details`
- `surfaceState`
- `budget`

### 8.5 显式 query 选择：`selectRecallHeadersForQuery()`

这是显式工具 `search_recall_memories(query=...)` 走的路径。

它和自动 recall 的区别是：

- 只返回 header selection，不直接读 detail 正文
- prompt 语义是“为显式检索选结果”
- 输出会进入 tool content/artifact

### 8.6 写入：`upsert()`

`upsert()` 会做这些事：

1. 决定目标 layer
2. 如果传了 `memoryId`，先尝试读取旧记录
3. 解析或推断 `semanticKind`
4. 生成标准化 body
5. 选择文件路径
6. 写文件
7. 失效缓存
8. 重建该 layer 的 `MEMORY.md`
9. 回读并返回完整记录

这里有几个关键实现细节：

- 如果是更新已有记忆，会复用原文件路径
- 如果是新建，则文件名是 `slug-title-uuid.md`
- `summary` 会从 `content + context` 生成 preview，最多 160 字

### 8.7 治理：`applyGovernance()`

当前只实现了 `archive`：

- 改 frontmatter 里的 `status`
- 重写文件
- 失效缓存
- 重建索引

## 9. 缓存策略

`XpertFileMemoryService` 里有两类缓存：

- `entrypointCache`
  缓存 layer 的 `MEMORY.md`
- `headerManifestCache`
  缓存 layer 的 header 清单

缓存 key 由这些字段组成：

- tenantId
- scopeType
- scopeId
- audience
- ownerUserId

一旦对某个 layer 执行 `upsert()` 或 `applyGovernance()`，会调用 `invalidateLayerCaches()` 只清该 layer 的缓存。

## 10. 召回系统详解

召回分成三层。

### 10.1 第一层：header 扫描

系统不会一上来把每个 `.md` 文件整篇读出来。

先用 `readFilePrefix()` 读取文件前缀：

- 限行
- 限字节
- 如果文件有 frontmatter，会尽量保证 frontmatter 读完整

这样扫描 header 的成本远低于全文读取。

### 10.2 第二层：lexical ranking

`recall-planner.ts` 会先做一个便宜、可解释的 lexical 排序。

它支持中英文混合场景：

- 英文按清洗后的 token 匹配
- 中文会做单字与 2~4 字 n-gram 切分

对于显式 query selector，打分大致由这些项组成：

- `titleScore * 0.44`
- `summaryScore * 0.22`
- `tagScore * 0.14`
- `exactTitle`
- `layerBoost`
- `semanticBoost`
- `recencyBoost`
- `recentToolPenalty`

其中：

- 用户私有层会有轻微 boost
- 最近 3 / 14 / 45 天内修改过的文件有 recency boost
- 如果某条 reference 记忆只是某个最近用过工具的使用说明，而且没有 warning/gotcha/issue 线索，会被惩罚，防止每轮都重复召回工具说明

### 10.3 第三层：可选模型 selector

lexical ranking 之后，插件还可以调用一个 recall model 做第二轮选择。

它的做法不是让模型直接看正文，而是让模型看 manifest：

- id
- kind
- semanticKind
- audience
- relative path
- title
- tags
- summary
- modified time

然后要求它只返回：

```json
{"selectedIds":["..."]}
```

这样做的好处是：

- 模型的上下文成本低
- 结果可解释
- 可以和 lexical fallback 拼起来用

### 10.4 为什么要分成 query selector 和 async selector

因为这两个场景目标不一样：

- `selectRecallHeaders()`
  给显式检索工具用，目标是“把用户应该看到的结果选出来”
- `selectAsyncRecallHeaders()`
  给自动 recall 用，目标是“挑出值得继续注入正文的记忆”

两者 prompt 语义不同，但都复用了同一个 `runSelector()`。

### 10.5 超时与回退

模型 selector 不是无限等待的。

默认预算：

- `DEFAULT_SELECTOR_WAIT_BUDGET_MS = 1500`

如果超过预算：

- 本轮立即 fallback 到 lexical top N
- selector promise 不会阻塞主流程
- 晚到结果只记 debug，不再反写当前回合

同时还有背压控制：

- `MAX_DETACHED_SELECTOR_RUNS = 2`

如果后台已经挂了太多迟到 selector，本轮直接跳过模型 selector，走快速 fallback。

### 10.6 internal / nostream 静默化

selector 和 writeback decision 都会通过：

`createInternalRunnableConfig(runName)`

加上这些配置：

- `metadata.internal = true`
- `tags = ['nostream', 'file-memory-internal']`

目的是：

- 让这类 structured-output 调用不要把原始 JSON 流到用户界面
- 避免出现 `{"selectedIds":[...]}` 或 `{"action":"upsert"...}` 这类内部结果泄露

这一步是插件侧对宿主现有限制下能做的关键治理之一。

## 11. 中间件时序详解

`FileMemorySystemMiddleware` 是这套系统真正和 Agent 生命周期对接的地方。

### 11.1 `beforeAgent`

在模型真正开跑之前：

1. 从 `state` 提取 query
2. 从消息历史里提取 recent tools
3. 读取已 surfacing 过的路径与 bytes
4. 生成 recall event id
5. 如果模式是 `hybrid_async`，立即启动后台 recall prefetch

这里不会直接把 detail 打进上下文，只是做准备。

### 11.2 `wrapModelCall`

这是最核心的一步。

它会先把系统规则拼到 system message 上：

- 当前用户本轮输入优先于记忆
- digest 足够回答就不要再调工具
- 需要精确读取时只能使用工具返回的 canonicalRef / relativePath
- 禁止猜 memoryId

然后按模式注入记忆内容。

#### `legacy_blocking`

阻塞式流程：

1. 发出“记忆召回中”事件
2. 同步执行 `buildRuntimeRecall()`
3. 注入 digest + index + detail
4. 发出完成事件

优点是 detail 更稳定，缺点是首 token 等待时间更长。

#### `hybrid_async`

混合异步流程：

1. 先注入 digest + index
2. 如果后台 recall 预取已经完成，再补 detail
3. 如果后台 recall 还没好，主流程先继续

这就是当前更推荐的模式。

它的核心目标是：

- 首轮尽量快
- detail 来得及就补
- 来不及也不拖垮响应

### 11.3 `wrapToolCall`

每次模型调用任意工具后：

- 会记录 recent tool
- 会把工具名、参数、结果拼进 recall query
- 重新触发后台 recall prefetch

这样可以让 recall 跟着 agent 行为动态变化，而不是只盯着最初那句用户问题。

### 11.4 `afterAgent`

回合结束后，如果满足条件：

- scope 存在
- writeback 开启
- 本轮没有显式 `write_memory`
- 有消息
- 配置了 writeback model

就会把消息快照丢到 `FileMemoryWritebackRunner` 里后台处理。

如果 `waitPolicy = soft_drain`，还会在交互结束前短暂等一下后台队列。

## 12. 显式工具

这个插件暴露了两个工具。

### 12.1 `search_recall_memories`

支持三种互斥输入，且必须三选一：

- `query`
- `memoryId`
- `relativePath`

#### query 模式

适用于“我知道自己要找什么，但还没有精确引用”的场景。

它会：

1. 调用 `selectRecallHeadersForQuery()`
2. 得到一组 header
3. 返回面向模型和用户的结果列表

每项包含：

- `id`
- `canonicalRef`
- `relativePath`
- `title`
- `summary`
- `kind / semanticKind`

#### memoryId 模式

适用于已经拿到 canonicalRef 的精确读取。

它还有一个小 fallback：

- 如果传入值尾部像 UUID，会尝试抽取末尾 UUID 再查一次

这是为了兼容某些历史情况下用户或模型传入了“标题-uuid”这类字符串。

#### relativePath 模式

适用于用 digest 或 query result 里给出的精确相对路径继续读取正文。

### 12.2 `write_memory`

显式写入 durable memory。

它不会经过 writeback runner，而是直接调用 `fileMemoryService.upsert()`。

写完后会把 `explicitWriteOccurred = true`，从而阻止本轮 afterAgent 再做一次自动写回，避免重复。

## 13. 用户可见 recall 事件

插件会通过 `ON_CHAT_EVENT` 派发 `memory_recall` 类型事件。

当前事件分两类来源：

- `source = 'auto'`
  自动召回
- `source = 'tool'`
  显式工具检索

事件文案由 `recall-event-message.ts` 统一生成，当前策略是：

- 进行中：显示“正在为 xxx 补充相关长期记忆”或“正在检索 xxx”
- 成功：显示“已选中 / 已命中 N 条记忆”
- 如果有标题，最多展示 3 个
- 单个标题超过 20 个字符会截断
- 超过 3 条时追加“等 N 条”
- fallback 时会明确告诉用户“已改用快速召回”

这样做的目标是：

- 用户知道系统在做什么
- 不再看到内部 id 列表
- 不暴露 selector 原始 JSON

## 14. 写回系统详解

写回是另一条独立主链。

### 14.1 为什么要 runner

afterAgent 阶段不适合在主请求线程里同步做大量写回决策，所以这里用了 `FileMemoryWritebackRunner`。

Runner 的关键设计：

- 以 `tenantId:scopeType:scopeId:userId` 为 key
- 同一个 key 只保留最新快照
- 如果前一轮还在跑，后一轮会 coalesce，避免同一作用域无限堆积

### 14.2 写回输入是什么

Runner 处理的是一个消息快照：

- 最近一段消息历史
- 用户 id
- conversation id
- scope
- writeback model
- optional custom prompt

为了控制成本，实际用于搜索与判断的 conversation text 只会：

- 截取最后 18 条消息
- 最终裁剪到 12,000 字符

### 14.3 为什么按 semantic kind 分四轮做

写回不会让模型一次性输出一堆混合类型决策，而是按这四类分别跑：

- `user`
- `feedback`
- `project`
- `reference`

每轮都先用 conversation text 去现有记忆里搜最多 5 条 candidate，再让模型判断：

- `noop`
- `upsert`
- `archive`

好处是：

- prompt 更聚焦
- 类型更稳定
- 更容易优先更新已有记忆而不是盲目增量创建

### 14.4 写回 prompt 设计

`file-memory.writeback.ts` 会构造一个很明确的决策 prompt：

- 指定当前 semanticKind
- 明确 action 只能是三选一
- 要求每个字段都按 JSON schema 输出
- 明确区分 user/shared audience
- 强调尽量更新已有记忆而不是新建重复项
- 强调默认用中文写 title/content/context/tags/reason

### 14.5 决策容错

调用模型时优先走严格 schema：

- `MEMORY_WRITE_DECISION_SCHEMA`

如果 parser 出错，但异常对象里带了 `llmOutput`，还会尝试：

1. 从报错里取原始字符串
2. 宽松提取 JSON object
3. 用 fallback schema 再 parse 一次

这能提升实际运行稳定性。

## 15. 文件命名与可读性

当前文件名规则是：

```text
<slug(title)>-<uuid>.md
```

例如：

```text
用户姓名-3b9b0e0e-93b5-4fc4-a6dc-7760fca7292a.md
```

这比纯 UUID 文件名更可读，同时仍保留稳定 id。

而运行时真正的精确标识仍然是：

- `canonicalRef`，当前等于 `id`
- 或 `relativePath`

不要把“人类可读文件名”误当成真正的 memoryId。

## 16. Freshness、预算与防爆机制

### 16.1 Freshness

`memory-freshness.ts` 会把过旧记忆转成更利于模型理解的文本：

- `today`
- `yesterday`
- `N days ago`

如果超过 1 天，还会生成 freshness note，提醒：

- 这是 point-in-time observation
- 文件行号、代码行为等可能已经过时
- 需要和当前代码再核对

### 16.2 关键预算

当前主要常量包括：

- `MAX_ENTRYPOINT_LINES = 200`
- `MAX_ENTRYPOINT_BYTES = 25_000`
- `MAX_MEMORY_FILES = 200`
- `MAX_HEADER_LINES = 30`
- `MAX_MEMORY_LINES = 200`
- `MAX_MEMORY_BYTES = 4_096`
- `MAX_RECALL_BYTES_PER_TURN = 20 * 1024`
- `MAX_RECALL_BYTES_PER_SESSION = 60 * 1024`
- `MAX_SELECTED_TOTAL = 5`
- `MAX_RUNTIME_SUMMARY_ITEMS = 5`
- `DEFAULT_SELECTOR_WAIT_BUDGET_MS = 1_500`
- `DEFAULT_SHORTLIST_SIZE = 20`
- `MAX_DETACHED_SELECTOR_RUNS = 2`

这些预算不是随便拍脑袋定的，它们分别在控制：

- 索引注入成本
- 单条详情的上下文占用
- 单回合 recall 注入体积
- 多轮对话累计的记忆占用
- 子模型 selector 等待时间
- 后台迟到 selector 的并发数量

## 17. 配置项

中间件配置定义在 `file-memory.middleware.types.ts`。

可配置项分两组。

### 17.1 recall

- `enabled`
- `mode`
  - `hybrid_async`
  - `legacy_blocking`
- `model`
- `timeoutMs`
- `maxSelected`
- `prompt`

### 17.2 writeback

- `enabled`
- `waitPolicy`
  - `never_wait`
  - `soft_drain`
- `model`
- `qaPrompt`
- `profilePrompt`

一个典型配置大概长这样：

```json
{
  "enableLogging": true,
  "recall": {
    "enabled": true,
    "mode": "hybrid_async",
    "timeoutMs": 1500,
    "maxSelected": 5,
    "model": { "...": "LLM config" }
  },
  "writeback": {
    "enabled": true,
    "waitPolicy": "never_wait",
    "model": { "...": "LLM config" }
  }
}
```

## 18. 调试与日志

当 `enableLogging = true` 时，插件会输出大量运行时信息，包括：

- recall 启动与预算
- selector 输入
- tool request / response
- 最终送入主模型的消息
- writeback runner 开始、完成、跳过原因

另外，recall 结果还会通过 `ON_CHAT_EVENT` 发给聊天侧。

调试时建议重点看三类日志：

- `[FileMemorySystem] prepared query=...`
- `[FileMemorySystem] ..._budget_ms budget=...`
- `[FileMemorySystem] writeback ... decision=...`

## 19. 已知边界与取舍

### 19.1 这是文件系统，不是事务数据库

优点：

- 人能直接看
- 迁移简单
- 调试直接

代价：

- 没有数据库级事务
- 并发写同一文件时需要更高层避免冲突
- 大规模检索性能不如专门索引系统

### 19.2 当前显式工具结果仍会把 canonicalRef / id 暴露给模型

这是当前 runtime 协议下的现实约束：

- tool `content` 和 `artifact` 同时被模型与用户链路消费
- 因而“模型看得到 id，但用户绝对看不到 id”不能只靠插件单边完成

当前插件已经做到的是：

- selector / writeback 这类内部 structured-output 静默化
- recall 状态事件改成人类可读的数量与标题

但显式 `search_recall_memories` 的精确读取能力仍然依赖 canonicalRef / relativePath。

### 19.3 当前 scope 主要是 xpert 级

虽然 `MemoryScopeType` 允许 `workspace`，但当前 `resolveScope()` 实际只会生成 `xpert` scope，并用 `workspaceId` 影响物理根目录。

如果未来要做真正的 workspace 级共享记忆层，还需要进一步扩展 scope 解析和可见层策略。

### 19.4 recall 不是向量检索

当前实现是：

- 先 header 扫描
- 再 lexical ranking
- 再可选模型 selector

它的好处是可解释、轻量、可控；代价是语义召回上限受 lexical ranking 和 prompt 设计影响。

## 20. 阅读源码建议

如果你要继续改这个插件，建议按下面顺序读：

1. `src/index.ts`
2. `src/lib/file-memory.module.ts`
3. `src/lib/file-memory.middleware.ts`
4. `src/lib/file-memory.service.ts`
5. `src/lib/recall-planner.ts`
6. `src/lib/file-memory.writeback-runner.ts`
7. `src/lib/file-memory.writeback.ts`
8. `src/lib/memory-taxonomy.ts`
9. `src/lib/path-policy.ts`

这样你会先理解“运行时怎么接入”，再理解“底层怎么读写”，最后理解“分类、路径和边界条件”。

## 21. 一句话总结

`file-memory` 的核心不是“把聊天内容存成 Markdown”，而是：

在一个插件内，把 durable memory 的文件存储、索引管理、模型前召回、显式读写工具、回合后写回、用户可见事件和上下文预算控制，组合成一套可维护、可解释、可扩展的长期记忆运行时。
