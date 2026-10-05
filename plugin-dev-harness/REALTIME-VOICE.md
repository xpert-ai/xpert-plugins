# Realtime voice adapters

This change requires the realtime-capable host contracts and plugin SDK from an Xpert host checkout containing the realtime voice implementation. The planned minimum package version is **3.20.0**; it is not a claim that this version has been published. Release SDK/contracts first, update the lockfile against their published versions, then package the plugins. Do not publish plugins with an unmet peer dependency.

## Provider configuration

Both model plugins retain their existing installation metadata without adding `xpert.plugin` configuration. Configure providers and Copilots in the intended organization. When changing a previously registered source checkout, use the local deploy command's `--force-install`; ordinary refresh uses the stored workspace path rather than the newly supplied directory. Verify the running descriptor and provider schemas after any coordinated API restart.

- **Volcengine Speech** (`volcengine-speech`) is registered by `@xpert-ai/plugin-volcengine`, separately from the existing Ark provider. Configure `speech_api_key` from the Speech console and grant access to model `1.2.6.1`. The adapter uses Seeduplex 3.0 JSON frames, not the legacy binary protocol. Input is 16 kHz, mono, signed 16-bit PCM; output explicitly requests `pcm_s16le`, 24 kHz.
- **Tongyi / Qwen Omni Realtime** reuses `dashscope_api_key` and the existing `api_host`. Set API Host to the Bailian workspace host, such as `example-workspace.cn-beijing.maas.aliyuncs.com` or `https://example-workspace.ap-southeast-1.maas.aliyuncs.com`. Workspace and region are already encoded in this host; no separate realtime fields are needed. The adapter converts HTTPS to WSS and appends `/api-ws/v1/realtime?model=...`. The public `dashscope.aliyuncs.com` host cannot supply a workspace ID and is not a valid host for this realtime model. The shared international-endpoint switch does not override an explicit workspace host. The first model is `qwen3.8-omni-flash-realtime`. Workspace-scoped realtime configuration validates its shape locally instead of requiring access to qwen-turbo; actual authentication is checked when connecting.
- URLs are fixed provider domains. Keys stay in the Xpert provider credential store and are never returned to the desktop renderer.
- Pricing is intentionally unspecified until an operator supplies an applicable verified price. Missing usage is unknown, not zero. Doubao's usage event coverage must be verified with a live account.

## Capability differences

Both providers support duplex audio, transcripts and complete function-call arguments. The host exposes delegation, status, correction and cancellation as narrow tools. Qwen executes calls only when a completed `response.done` confirms them; argument completion alone is provisional and canceled responses cannot launch tasks. It receives one function output per call, waits for every matching `conversation.item.created` receipt, then permits one continuation. A newer speech generation retires older continuations, including late receipt acknowledgements. Doubao receives the full tool-result batch and resumes itself.

Doubao can synthesize an idle task completion notification. If it is busy, the host queues the notification and retries after playback and user speech become idle; the persistent task card remains available. Qwen keeps system instructions fixed for the call. Authoritative task snapshots and completion notifications enter its conversation as typed, quoted runtime data using a text-message carrier, following Qwen Live Harness. The provider uses a user role for that carrier; it is not a real user request, never emits a user transcript, and is not persisted as a human chat message. Do not resend a completed function call's output: Qwen rejects reused call IDs.

The host uses the same task snapshot for model context and UI. Snapshot messages are silent, bounded, and coalesced; completion speech waits for an exact echoed-message acknowledgement (provider item IDs may be replaced), then requests one response. Historical queued/running tool receipts cannot stand in for current status: progress questions use the latest terminal result or require `get_task_status` when still pending/unknown. Runtime payloads confer no authority for new work. Notification acknowledgement has a bounded timeout. A newer user turn consumes an acknowledged notification without creating a competing response. Neither adapter claims sample-accurate provider history truncation.

Qwen VAD owns automatic cancellation on speech onset; the adapter clears local playback without sending a competing cancel request. Explicit interruption still sends an idempotent cancel. Correlated cancellation errors, explicit active-response conflicts, the provider's exact semantic-turn rejection, and explicitly identified rejected tool receipts are recoverable. Qwen can omit machine codes for the last two; the wire boundary normalizes only its fixed error forms and discards free text. A rejected turn does not cancel accepted work or retry tools. Unacknowledged outputs time out without replay; unknown, authentication and quota errors remain fatal. Qwen has no `session.finish` event: closing belongs to the transport owner. The host records `voice_protocol_error`, `voice_provider_closed` and `voice_call_ended` with the session handle and bounded machine codes, never raw provider messages, audio or credentials. Desktop diagnostics retain the host error code in the console. Continuous-call acceptance must cover speaking over an answer, tool output during speech, background completion and subsequent turns, not just one successful search.

## Checks

From the `xpert-plugins` root, with realtime-capable contracts and SDK installed in the plugin workspace and the [lifecycle harness](README.md) built:

```sh
corepack pnpm -C xpertai exec nx run-many -t build -p @xpert-ai/plugin-tongyi @xpert-ai/plugin-volcengine --skip-nx-cache
corepack pnpm -C xpertai exec nx run @xpert-ai/plugin-tongyi:test --runInBand --skip-nx-cache
corepack pnpm -C xpertai exec nx exec --projects=@xpert-ai/plugin-volcengine -- node ../../node_modules/jest/bin/jest.js --config jest.config.ts --runInBand --runTestsByPath src/speech/realtime/protocol.spec.ts
node plugin-dev-harness/realtime-providers.mjs
node plugin-dev-harness/dist/index.js --workspace ./xpertai --plugin @xpert-ai/plugin-tongyi
node plugin-dev-harness/dist/index.js --workspace ./xpertai --plugin @xpert-ai/plugin-volcengine
```

`realtime-providers.mjs` loads built files and checks packaged provider/model discovery, approved voices and credential/endpoint boundaries without connecting to a supplier. The lifecycle harness uses its documented host mocks. These checks do not prove live provider access, acoustic echo cancellation or production latency.

Task-state acceptance must ask about progress while the search is running, observe the actual `web_search` completion and source URLs, then ask about progress again after the spoken completion. Verify a fresh pending-status read, authoritative completed results on later questions, correct spoken results, no duplicate task execution, and no internal delegation/context displayed as human messages. A successful search or a persistent completed UI card alone does not prove voice-context synchronization.

2026-10-05 interruption regression: 31 Qwen protocol tests and 12 host connection tests passed, along with plugin compilation and lifecycle loading. A 112-second live Qwen call included nine short progress questions, seven provider-confirmed canceled responses, and two post-completion questions. It retained one delegated task, executed two web searches plus successful source-page retrieval, delivered the completed result, and exposed no internal human messages. Wire verification confirmed every manual continuation followed tool-output acknowledgement and recorded zero provider errors. The original user call's code-less `invalid_request_error` had no retained message; its exact provider cause remains unconfirmed. Known semantic-turn rejection and rejected-receipt recovery are covered by deterministic protocol tests, not claimed as live provider reproductions. Protected local receipts contain runtime identifiers; do not copy them into source.

The full Volcengine suite additionally has 18 failures in unchanged Seedream image/video tests (legacy usageAvailability/reportUsage and missing workspace/queue runtime mocks). Restoring the original dependency links reproduces the same 18 failing test cases. Realtime protocol tests pass independently; keep this broader failure visible before a combined plugin release.

Official protocol references:

- [Qwen Omni Realtime](https://help.aliyun.com/zh/model-studio/realtime)
- [Doubao Seeduplex 3.0 protocol](https://docs.volcengine.com/docs/DoubaoVoice/endtoend-realtime-voice-full-duplex-version?lang=zh)
- [Doubao access guide](https://www.volcengine.com/docs/6561/2549732)

- [Qwen Live Harness result delivery and runtime context](https://github.com/QwenLM/Qwen-Live-Harness/blob/main/packages/qwen-live-harness/README.md)
