# @xpert-ai/plugin-xirang

## 0.3.0

### Minor Changes

- 3dd1793: Add explicit ASR and signed WebSocket TTS adapters, speech model definitions and manual credential fields. Preserve discovery contract boundaries and document the host manual-model type filtering issue.

### Patch Changes

- 1f3afbb: Omit unset LLM generation parameters so Tianyi can use its server defaults. Preserve saved assistant overrides, output limits and streaming usage reporting, and stop injecting generation defaults through model parameter schemas or credential validation.

  Preserve the exact account API model ID during discovery while reusing matching built-in configuration metadata.

## 0.2.4

### Patch Changes

- c3d950d: Require plugin-sdk 3.22.1 and contracts 3.21.2 for model discovery and saved model configuration. Update the official workspace lockfile to the published packages so release builds resolve these APIs on clean CI installs.

## 0.2.3

### Patch Changes

- d791efc: Discover account-visible models through the Xirang models endpoint, seed configuration from the built-in catalog, and apply saved limits to LLM, embedding, and rerank clients. Preserve endpoint mappings internally while removing the endpoint ID override from the model form.

## 0.2.2

### Patch Changes

- cb3bbe0: Add the deepseek-v4.1-flash preset with the Tianyi model-square endpoint id, a 1M context window, vision and tool features, and official DeepSeek V4.1 Flash peak and off-peak prices.
