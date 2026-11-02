# @xpert-ai/plugin-openai

## 0.2.0

### Minor Changes

- 809d774: Add GPT-6 Astra, GPT-6.1 Sol, GPT-6.1 Terra, GPT-6 Luna and GPT-6 Sol with official model limits, reasoning options and Standard pricing. Preserve Responses model settings and omit incompatible sampling parameters while reasoning.

  Retain cache and reasoning usage details, and validate official provider credentials through the model list without requiring access to a legacy probe model.

  Remove gpt-5.4, gpt-5.4-pro, gpt-5, gpt-5.2-chat and gpt-5.2-codex from the preset catalog while retaining gpt-5.2, gpt-5.2-pro and gpt-5.3-codex. Custom gateway credential checks now follow the current catalog, and packaging removes stale YAML assets. Existing Assistant configurations are not automatically migrated; select a retained model for Assistants using removed entries.

  Apply official sampling restrictions to registered legacy reasoning models as well, including GPT-5.2 and saved GPT-5.4 configurations and call-level reasoning overrides.
