# Callback recovery

The Lark plugin acknowledges each Handoff callback only after enqueueing a managed
`lark.callback/apply` job. Workers serialize each tenant/organization/integration/
Assistant/run through a renewable Redis lease. Token-checked writes and release
prevent an expired worker from overwriting its successor. Completion receipts and
job IDs suppress late duplicates for 24 hours; old base64 cache snapshots remain
readable during an upgrade.

An end/error callback also schedules a recovery job after five seconds. Normal
out-of-order delivery continues while waiting. If a sequence never arrives, the
plugin replaces the card using the explicit successful `on_message_end` snapshot.
It preserves execution errors and approval interruptions. Without a complete text
snapshot, it shows a recovery error rather than treating partial text as success.
If all terminal callbacks are lost, the plugin cannot infer that execution ended.

A stale steer follow-up waits through retryable managed jobs until the preceding
card is terminal. It persists the prepared dispatch envelope before enqueueing and
reuses the same dispatch ID on retry, including when message history is disabled.
A changed active card prevents recovery from being redirected to another card.
Existing history enqueue receipts are also honored.

All replicas must load the updated plugin before validating new traffic. Legacy
workers do not participate in the new lease protocol. No platform changes,
database migration, or additional GitHub workflow are required.

## Local regression tests

Start a disposable local Redis and set its URL, then run from `xpertai`:

```sh
LARK_TEST_REDIS_URL=redis://127.0.0.1:6379 \
  NX_DAEMON=false corepack pnpm exec nx test @xpert-ai/plugin-lark \
  --runInBand --testPathPatterns=handoff --skip-nx-cache
```

The Redis suite runs the real state service, callback processor, card renderer and
dispatch service in three separate Node processes. Only host queue plumbing,
conversation/history persistence and Lark HTTP are fixtures. It covers parallel
deltas, gap recovery, duplicate/late events, expired owners, transport/cache
failures, tenant isolation, and a subsequent message completing after stale-steer
recovery. It does not send messages to Lark or prove production acceptance.

The fixture retains dispatch IDs as the host's deduplication boundary. External
HTTP acceptance and a Redis write are not one transaction: a retry can patch the
same card again; exact-once delivery through the existing text fallback is not
claimed.
