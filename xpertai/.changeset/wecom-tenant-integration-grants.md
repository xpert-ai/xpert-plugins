---
'@xpert-ai/plugin-wecom': minor
---

Allow organization Assistants to select explicitly authorized tenant WeCom integrations, with separate grants for trigger binding and notification invocation. Label the integration scope and prevent conflicting Assistant bindings.

Persist the Assistant execution scope and recheck grants when publishing triggers, handling callbacks, flushing delayed messages, and invoking notification tools. Revoked grants fail closed while existing configuration is retained.

Requires the coordinated Xpert host, contracts, and plugin-sdk changes from xpert-ai/xpert#1269, including the integration availability endpoint and usage-aware permission reader. Older hosts are rejected with an upgrade error. Publish the corresponding SDK/contracts before releasing this plugin; the development changes are validated against the paired host sources, not the currently published SDK.
