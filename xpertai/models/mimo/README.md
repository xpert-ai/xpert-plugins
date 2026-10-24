# Xpert Plugin: Xiaomi MiMo

`@xpert-ai/plugin-mimo` adds the Xiaomi MiMo model provider to XpertAI.

The provider schema, model catalog, ordering, capability metadata, parameters,
pricing metadata, and icons are synchronized from the current Dify
`langgenius/mimo` plugin. The provider supports Xiaomi's pay-per-use endpoint
and the China, Singapore, and Europe Token Plan endpoints exposed by Dify.

## 模型目录（2026-10-14）

预置目录已切换到 MiMo V2.6。每个模型的上下文窗口为 1M tokens，最大输出为 131072 tokens。凭证校验使用 `mimo-v2.6-flash`。插件默认关闭思考模式；开启后，小米会把 `temperature` 固定为 1.0、`top_p` 固定为 0.95。展示价格是官方海外按量付费的未命中缓存美元价格，Token Plan 由小米单独计费。`mimo-v2.6-pro-ultraspeed` 需要小米单独开通，不在标准 Token Plan 模型列表中。

小米官方文档还支持音频输入。当前模型特性契约没有音频类型，因此目录只声明文本、图像和视频输入，与上游 Dify 目录一致。

旧模型保留在目录中并标记为 `deprecated`。选择器不能再新选这些模型，已保存的模型配置仍能解析原来的参数和价格。请把现有应用改到对应的新模型：

| 原模型 | 替代模型 |
| --- | --- |
| `mimo-v2.5-pro` | `mimo-v2.6-pro` |
| `mimo-v2.5` | `mimo-v2.6-flash` |
| `mimo-v2-flash` | `mimo-v2.6-flash` |

小米会在北京时间 2026-10-14 18:00 起把 V2.5 请求自动转到 V2.6，并在北京时间 2026-10-21 10:00 停止接受 V2.5 名称。`mimo-v2-flash` 已于 2026-06-30 下线。更新插件不会改写已保存的应用配置。

## Models

- `mimo-v2.6-pro`
- `mimo-v2.6-flash`
- `mimo-v2.6-pro-ultraspeed`
- `mimo-v2.5-pro`（deprecated）
- `mimo-v2.5`（deprecated）
- `mimo-v2-flash`（deprecated）

## Development

```bash
pnpm -C xpertai exec nx test @xpert-ai/plugin-mimo
pnpm -C xpertai exec nx build @xpert-ai/plugin-mimo
pnpm -C xpertai --filter @xpert-ai/plugin-mimo prepack
```
