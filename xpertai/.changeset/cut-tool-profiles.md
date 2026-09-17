---
"@xpert-ai/plugin-cut": patch
---

Add shared fine-grained profiles and plugin-owned operation discovery/execution. Native Xpert registers four base queries and two gateways instead of all operation schemas. Preserve scoped operation validation and the existing per-operation MCP publication; provide static Codex allowlist export.

Migrate public registration to one decorated Cut provider, retaining MCP resources, prompts and tasks. Requires the SDK 3.18.6 decorated capability extensions.

Register all Cut MCP resource templates and workflow prompts through SDK method decorators while preserving existing handlers and public identifiers.
