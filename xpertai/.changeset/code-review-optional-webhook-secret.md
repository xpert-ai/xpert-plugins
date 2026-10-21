---
"@xpert-ai/plugin-code-review": minor
---

Allow saving GitHub App configuration without a webhook secret. Treat omitted, null, empty, and whitespace-only values as unset, while preserving nonblank secrets exactly and requiring at least 32 characters when provided.

Update the configuration form, setup guidance, and documentation to explain the optional field. Webhook deliveries still require a configured secret and a valid signature; saving without a secret does not enable unsigned deliveries.
