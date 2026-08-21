# 天翼云星辰模型提供商插件

`@xpert-ai/plugin-xirang` 将天翼云星辰 MaaS 的 OpenAI 兼容接口接入 Xpert。Provider 使用 AppKey 作为原始 `Authorization` 请求头，默认地址为 `https://ai.ctaigw.cn/v1`，也可以在系统集成中覆盖端点。

插件要求 `@xpert-ai/plugin-sdk` 和 `@xpert-ai/contracts` `3.17.2` 或更高版本。

## 已接入能力

- 目录快照来自 `https://ctxirang.ctyun.cn/maas/inlineService`。
- 名称包含“（即将下线）”的 5 个服务不会生成模型配置。
- 97 个 LLM、4 个文本向量模型、4 个 Rerank 模型和 10 个图片模型会生成预置模型 YAML。
- 10 个图片模型统一通过 `POST /v1/images/generations` 适配器接入，模型特有字段可透传；图片编辑模型若要求专用 `/edits` 契约，应按天翼云详情页补充字段。视频服务保留在 `src/catalog/normalized.snapshot.json`，待天翼云提供稳定的异步任务提交/查询契约后再启用。

## 配置方式

1. 在目标组织范围安装并启用插件 `@xpert-ai/plugin-xirang`。插件现在是组织级插件，不再要求租户级安装。
2. 在系统集成或模型供应商凭据中填写天翼云星辰 AppKey；默认 API 地址保持 `https://ai.ctaigw.cn/v1`。
3. 选择预置模型。Rerank 模型必须在“API 使用的模型名称 / Rerank 模型 ID”中填写模型详情页顶部的模型 ID；`qwen3-rerank` 只是展示名，不能作为天翼云官方 Reranker API 的 `model` 参数。
4. 保存后先执行凭据校验，再在 Assistant 的模型配置中选择该 Provider。

Rerank 的默认协议以天翼云官方 [Reranker 重排序 API](https://www.ctyun.cn/document/11061839/11075357) 为准。

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

`XirangProviderStrategy` 负责凭据和 `/models` 健康校验；LLM 复用 SDK 的 `ChatOAICompatReasoningModel` 并打开 `streamUsage`，以获得最终 token 用量；Embedding 使用 `OpenAIEmbeddings`；Rerank 和图片生成使用原生 `fetch`。Rerank 默认复用提供商 AppKey，按天翼云官方契约调用 `/rerank`，发送 `Authorization: Bearer <AppKey>` 和模型 ID；兼容客户网关的 `/reranks`、独立 API Key、raw 鉴权和 `instruct` 可在模型凭据中显式配置。模型目录由 `scripts/generate-catalog.mjs` 从快照重复生成，避免手工维护 100 多个 YAML。
