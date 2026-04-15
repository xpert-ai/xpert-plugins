# XpertAI 插件: File Memory 中间件

`@xpert-ai/plugin-file-memory` 是一个 `sandbox-only` 的 durable memory 中间件。

它负责把记忆落成 Markdown 文件，并在 Agent 运行时完成：

- 读取层级索引和摘要
- 在模型调用前注入轻量记忆上下文
- 提供显式记忆读取/写入工具
- 在回合结束后可选做异步 writeback

这份文档只描述当前实现，不再保留旧的 host path / `users/<userId>` / `enabled` 配置说明。

## 当前实现的核心约束

- 中间件要求宿主启用 `sandbox` feature。
- 插件不再回退到宿主机绝对路径，也不再依赖宿主文件路径配置。
- 记忆根目录固定是当前 workspace 根目录下的 `./.xpert/memory`。
- 仍然保留 `xpertId` 隔离层。
- 去掉 `users/<userId>` 目录层，改成 `private/` 和 `shared/` 两个 layer。
- 私有记忆仍然保留 `ownerUserId` 语义，但通过 frontmatter 过滤，不再通过目录隔离。

## 用户需要配置什么

现在不再有三个 `enabled` 开关。

- recall 是中间件的固有能力
- `write_memory` 工具始终可用
- 自动 writeback 是否生效，只取决于是否配置了 `writeback.model`

也就是说，用户不需要再做“启不启用 recall / writeback / tool”的额外选择。

## Config Schema

公开配置只有两个顶层块：

- `recall`
- `writeback`

它们都是可选的。

### `recall`

| 字段 | 类型 | 默认值 | 用法说明 |
| --- | --- | --- | --- |
| `recall.mode` | `hybrid_async \| legacy_blocking` | `hybrid_async` | 控制 recall 详情是后台异步预取，还是阻塞当前模型调用。大多数场景保持 `hybrid_async`。 |
| `recall.model` | `ICopilotModel` | 无 | 可选的 recall selector 模型。未配置时仍可工作，只是退回本地 header ranking。 |
| `recall.timeoutMs` | `number` | `1500` | selector 的等待预算。更大意味着更愿意等模型选择结果，更小意味着更快回退。 |
| `recall.maxSelected` | `number` | `5` | 单回合最多注入多少条完整记忆正文。建议保持较小，避免上下文膨胀。 |
| `recall.prompt` | `string` | 内置 prompt | 仅在你明确要改 recall 选择策略时才需要覆盖。 |

### `writeback`

| 字段 | 类型 | 默认值 | 用法说明 |
| --- | --- | --- | --- |
| `writeback.waitPolicy` | `never_wait \| soft_drain` | `never_wait` | 控制 `afterAgent` 是否在交互结束时短暂等待后台 writeback。默认不等。 |
| `writeback.model` | `ICopilotModel` | 无 | 自动 writeback 的关键开关。配置它就启用自动 writeback；不配就跳过。 |
| `writeback.qaPrompt` | `string` | 内置 prompt | 用于覆盖 `feedback / project / reference` 等非 user 记忆的写回决策提示词。 |
| `writeback.profilePrompt` | `string` | 内置 prompt | 用于覆盖 `user` 类偏好/画像记忆的写回决策提示词。 |

## 工具与外部可见路径

中间件提供两个工具：

- `search_recall_memories`
- `write_memory`

其中 `search_recall_memories` 支持三种精确读取方式：

- `query`
- `memoryId`
- `relativePath`

当前实现中，对外返回的 `relativePath` 已升级为带 layer 的形式：

- `private/<semanticDir>/<filename>.md`
- `shared/<semanticDir>/<filename>.md`

这样可以消除 private/shared 之间的同名冲突。

## 记忆如何写入文件系统

无论是显式 `write_memory`，还是自动 `writeback`，最终都会走同一条 `upsert()` 路径：

1. 根据当前 `xpertId` 解析 scope。
2. 根据 `audience` 决定写入 `private` 还是 `shared` layer。
3. 根据 `semanticKind` 决定语义目录。
4. 如果传入的 `memoryId` 已经命中现有文件，则复用原文件路径。
5. 否则生成新文件名：`<slug(title)>-<memoryId>.md`。
6. 生成 frontmatter 和 Markdown 正文。
7. 通过 sandbox backend 写入文件。
8. 重建当前 layer 的 `MEMORY.md`。

两种写入入口：

- 显式工具 `write_memory`
- 后台异步 `FileMemoryWritebackRunner`

## 路径是如何决定的

现在的路径决定逻辑完全收敛到插件内部，不再依赖宿主侧路径配置。

### 1. 根目录

记忆根目录固定为：

```text
./.xpert/memory
```

这里的 `.` 指的是当前 workspace 根目录。

因此最终物理位置可以理解为：

```text
<workspace dir>/.xpert/memory
```

workspace dir 由 Xpert runtime 决定：

- project 场景使用 project 共享根目录
- 非 project 场景使用 user 共享根目录

当前实现不再默认创建 thread 级子目录。若你在特殊提示词场景里确实想按线程进一步隔离，可以结合 `sys.thread_id` 自定义路径策略。

### 2. scope 目录

插件仍然保留 xpert 级隔离：

```text
xperts/<xpertId>
```

原因是 project 场景下，一个 workspace 根目录仍然可能被多个 xpert 共享；如果去掉这一层，不同 xpert 的记忆会混在一起。

### 3. layer 目录

每个 xpert 下只有两个 layer：

- `private`
- `shared`

对应的 layer 根目录为：

```text
./.xpert/memory/xperts/<xpertId>/private
./.xpert/memory/xperts/<xpertId>/shared
```

### 4. semantic 目录

每个 layer 下再按语义分类目录存放：

- `user`
- `feedback`
- `project`
- `reference`

旧的 `profile` / `qa` 仍然可读，但新写入会优先按 semantic 目录组织。

语义映射大致是：

- `user -> profile`
- `feedback / project / reference -> qa`

### 5. 文件名

新文件名格式：

```text
<slug(title)>-<memoryId>.md
```

更新已有记忆时默认复用原路径，不因标题变化而重命名。

## 最终目录布局

当前布局如下：

```text
./.xpert/memory/xperts/<xpertId>/private/<semanticDir>/<slug>-<memoryId>.md
./.xpert/memory/xperts/<xpertId>/shared/<semanticDir>/<slug>-<memoryId>.md
```

layer 级索引文件位置：

```text
./.xpert/memory/xperts/<xpertId>/private/MEMORY.md
./.xpert/memory/xperts/<xpertId>/shared/MEMORY.md
```

`MEMORY.md` 里的链接仍然使用“相对当前 layer 根”的相对路径，例如：

- `user/alice-style-123.md`
- `reference/release-dashboard-456.md`

## private 和 shared 的语义

`shared` 记忆：

- 对当前 xpert 下所有会话可见

`private` 记忆：

- 文件都落到同一个 `private/` layer 下
- frontmatter 里仍然写入 `ownerUserId`
- recall、精确读取、header scan 时按当前用户过滤

也就是说，私有性仍然存在，但表达方式从“目录隔离”变成了“frontmatter 过滤”。

## 运行时 recall 逻辑

### 第一轮模型调用

- 读取可见 layer 的 `MEMORY.md`
- 扫描 header
- 构建轻量 summary digest
- 只注入轻量上下文，不等待 recall detail

### 后续模型调用

- 后台异步 recall 可能已经选出更相关的完整记忆
- 下一次模型调用会消费这批 detail 一次
- 如果 selector 模型不可用或超时，会自动回退到本地排序

## Sandbox 存储层实现

插件内部新增了 `SandboxMemoryStore`，统一通过 sandbox backend 做文件 IO。

当前使用的接口是：

- 原始读取：`downloadFiles()`
- 写入/覆盖：`uploadFiles()`
- 枚举 Markdown：`globInfo()`
- 读取 mtime：`lsInfo()`

这样做的目的，是让插件只面向“当前 workspace 根目录下的相对路径”工作，而不是耦合宿主机路径或 volume 规则。

## 开发验证

在 `xpertai/` workspace 根目录执行：

```bash
pnpm exec jest --config middlewares/file-memory/jest.config.cjs --runInBand --watchman=false
```

类型检查：

```bash
pnpm exec tsc -p middlewares/file-memory/tsconfig.json --noEmit
```

## License

本项目遵循仓库根目录下的 [AGPL-3.0 License](../../../LICENSE)。
