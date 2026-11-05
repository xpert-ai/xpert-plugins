---
'@xpert-ai/plugin-code-review': patch
---

Prevent Code Review automation from exhausting shared API database connections. Keep GitHub, authorization and platform capability calls outside database transactions while preserving atomic quota reservations, policy revision checks and audit writes.

Replace repository-wide supervision with one Managed Queue job per record and phase: reserve quota, prepare a snapshot, dispatch and observe. Process webhook deliveries individually and separate workflow evidence preparation from dispatch. Scope renewable exclusion to a single PR or record during one stage, release it before handoff, and retain ownership checks at mutation boundaries. Preserve stable dispatch IDs, stale-job rejection, concurrent PR processing and periodic recovery of committed unfinished stages after queue failures or worker restarts.

Persist authenticated webhook events before acknowledgement and retry lock contention and transient authorization failures without creating duplicate review runs. When schema synchronization is externally managed, apply `migrations/20261105-webhook-inbox.sql` before loading this release. Keep automation paused during a rolling upgrade until every API instance has the updated transaction boundaries and scan/step processors, then resume automation.
