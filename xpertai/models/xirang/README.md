# 天翼云星辰模型提供商插件

`@xpert-ai/plugin-xirang` 将天翼云星辰 MaaS 的 OpenAI 兼容接口接入 Xpert。Provider 使用 AppKey 作为原始 `Authorization` 请求头，默认地址为 `https://ai.ctaigw.cn/v1`，也可以在系统集成中覆盖端点。

插件要求 `@xpert-ai/plugin-sdk` 和 `@xpert-ai/contracts` `3.17.2` 或更高版本，以使用带规则、时段和 `unpriced` 状态的计费接口。

## 已接入能力

- 目录快照来自 `https://ctxirang.ctyun.cn/maas/inlineService`。
- 名称包含“（即将下线）”的 5 个服务不会生成模型配置。
- 97 个 LLM、4 个文本向量模型、4 个 Rerank 模型和 10 个图片模型会生成预置模型 YAML。
- 10 个图片模型统一通过 `POST /v1/images/generations` 适配器接入，模型特有字段可透传；Seedream 4.5 的接口和价格已确认，图片编辑模型若要求专用 `/edits` 契约，应按天翼云详情页补充字段。视频服务保留在 `src/catalog/normalized.snapshot.json`，待天翼云提供稳定的异步任务提交/查询契约后再启用。

## 配置方式

1. 安装并启用插件 `@xpert-ai/plugin-xirang`。
2. 在系统集成或模型供应商凭据中填写天翼云星辰 AppKey；默认 API 地址保持 `https://ai.ctaigw.cn/v1`。
3. 选择预置模型。自定义模型可以填写模型名和可选的 endpoint model name。
4. 保存后先执行凭据校验，再在 Assistant 的模型配置中选择该 Provider。

## 计费策略

计费规则只接受服务目录中能被精确解析的价格：

- `¥ N/百万Tokens` 生成 input/output 两条 CNY 规则，单位大小为 1,000,000。
- 同时提供“标准时段/优惠时段”的模型生成 Asia/Shanghai 的 08:00–24:00 和 00:00–08:00 两个时段规则。
- 包含 `~` 的区间价、`-` 或 `-/百万Tokens` 不会被当作免费；插件生成一个不匹配的哨兵规则，使 Xpert 账本记录为 `unpriced`，等待补充阈值后再定价。
- Seedream 4.5 的模型详情页明确给出 CNY 0.25/张，因此图片模型生成按 `generation` 单位计费；没有明确图片价格的模型保持未定价。

每次目录更新后运行：

```bash
pnpm --dir xpertai/models/xirang catalog:generate
pnpm --dir xpertai/models/xirang build
pnpm --dir xpertai/models/xirang test
```

不要把 AppKey、私钥或其它凭据提交到仓库。`source.snapshot.json` 是目录审计快照，不是授权或永久免费承诺；页面上的“免费试用”取决于天翼云账户权益。

## 架构

`XirangProviderStrategy` 负责凭据和 `/models` 健康校验；LLM 复用 SDK 的 `ChatOAICompatReasoningModel` 并打开 `streamUsage`，以获得最终 token 用量；Embedding 使用 `OpenAIEmbeddings`；Rerank 和图片生成使用原生 `fetch`，因此能保留天翼云要求的原始 AppKey Header。模型目录由 `scripts/generate-catalog.mjs` 从快照重复生成，避免手工维护 100 多个 YAML。
