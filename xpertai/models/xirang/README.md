# 天翼云星辰模型提供商插件

`@xpert-ai/plugin-xirang` 将天翼云星辰 MaaS 的 OpenAI 兼容接口接入 Xpert。官方端点按天翼云文档发送 `Authorization: Bearer <AppKey>`，默认地址为 `https://ai.ctaigw.cn/v1`；显式配置的兼容网关仍保留原始 `Authorization` 值，也可以直接填写带 `Bearer` 前缀的值。

插件要求 `@xpert-ai/plugin-sdk` 和 `@xpert-ai/contracts` `3.17.2` 或更高版本。

## 已接入能力

- 目录快照来自 `https://ctxirang.ctyun.cn/maas/inlineService`。
- 名称包含“（即将下线）”的 5 个服务不会生成模型配置。
- 109 个 LLM、3 个文本向量模型、4 个 Rerank 模型和 8 个图片模型会生成预置模型 YAML。
- `qwen3.8-max` 和 `qwen3.8-flash` 按精确模型版本声明图片、视频、思考、工具调用和结构化输出能力；模型类型及能力来自 `src/catalog/model-metadata.json` 的显式清单，未核实的能力不会按名称猜测。
- 8 个图片模型统一通过 `POST /v1/images/generations` 接入，仅声明天翼公开契约覆盖的文生图能力。`qwen-image-edit`、`qwen-image-edit-plus`、`qwen-image-edit-max` 和多模态 `qwen3-vl-embedding` 在专用协议实现并验证前保留在审计快照，不生成运行时 YAML。视频服务同样保留在 `src/catalog/normalized.snapshot.json`，待天翼云提供稳定的异步任务提交/查询契约后再启用。

## 配置方式

1. 在目标组织范围安装并启用插件 `@xpert-ai/plugin-xirang`。插件现在是组织级插件，不再要求租户级安装。
2. 在系统集成或模型供应商凭据中填写天翼云星辰 AppKey；默认 API 地址保持 `https://ai.ctaigw.cn/v1`。
3. 选择预置模型。目录快照中已捕获模型 ID 的条目会自动使用该 ID，同时保留稳定的界面模型名；其余条目默认使用目录模型名。四个预置 Rerank 模型还会自动选择接口和请求体。接入自定义模型、自定义网关，或账号 `/models` 返回不同调用 ID 时，填写“API 模型名称或 ID 覆盖”和接口路径。
4. 保存后先执行凭据校验，再在 Assistant 的模型配置中选择该 Provider。

Rerank 的预置映射如下：`BGE-Reranker-Large` 和 `BGE-Reranker-V2-m3` 使用 `/v1/rerank`，`qwen3-rerank` 使用 `/v1/reranks`，`gte-rerank-v2` 使用 `/v1/services/rerank/text-rerank/text-rerank`。默认认证均为 `Authorization: Bearer <AppKey>`。四个模型的模型 ID 来自对应的天翼云模型详情页；自定义网关仍可通过模型凭据覆盖路径、模型名、密钥和鉴权方式。

本地源码部署时，使用主仓库的 `plugin:deploy:local` 并显式传入 `--scope organization --org-id <组织ID>`；组织范围不能沿用只带租户 ID 的部署命令。

每次目录更新后运行：

```bash
pnpm --dir xpertai/models/xirang catalog:generate
pnpm --dir xpertai/models/xirang build
pnpm --dir xpertai/models/xirang test
```

不要把 AppKey、私钥或其它凭据提交到仓库。`source.snapshot.json` 只保存模型名称、模型 ID 和分类所需的目录元数据。

隐私和数据处理说明见 [`docs/privacy.mdx`](docs/privacy.mdx)。插件不建立独立遥测或数据存储，但模型请求内容会发送到配置的天翼云 API 地址。

## 架构

`XirangProviderStrategy` 负责凭据和 `/models` 健康校验；LLM 复用 SDK 的 `ChatOAICompatReasoningModel` 并打开 `streamUsage`，以获得最终 token 用量；Embedding 使用 `OpenAIEmbeddings`；Rerank 和图片生成使用原生 `fetch`。图片管理器使用 SDK 的 `ImageGenerationModel` 契约。Rerank 默认复用提供商 AppKey，按天翼云官方契约调用 `/rerank`，发送 `Authorization: Bearer <AppKey>` 和模型 ID；兼容客户网关的 `/reranks`、独立 API Key、raw 鉴权和 `instruct` 可在模型凭据中显式配置。模型目录由 `scripts/generate-catalog.mjs` 从原始快照、LLM 规格和显式模型元数据重复生成，避免手工维护 100 多个 YAML。
