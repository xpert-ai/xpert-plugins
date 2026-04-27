---
'@xpert-ai/plugin-wecom': minor
---

Improve WeCom routing, session management, and long-connection reply behavior:

- Route inbound WeCom messages through persisted `WeCom Trigger` bindings instead of the old integration-level xpert field.
- Add session timeout and summary window controls, `/new` session reset handling, recipient directory tracking, and users/conversations management views with restart actions.
- Add SDK-backed long-connection streaming replies, welcome/restart cards, and safer connection startup handling so failed authentication no longer logs as connected or starts renew timers.

Migration note:

- Existing WeCom integrations should bind a `WeCom Trigger` before upgrade if they previously relied on integration-level xpert routing.
