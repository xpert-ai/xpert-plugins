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
card is terminal. The active-card check, recovery ownership and envelope preparation
share the conversation decision lock. A different follow-up waits for that recovered
run to finish; the owner can resume after a failure during preparation.
It persists the prepared envelope before calling the host's `enqueueOnce` method
and reuses the same dispatch ID on retry, including when message history is disabled.
A changed active card prevents recovery from being redirected to another card.
Existing history enqueue receipts are also honored.

Deploy the Xpert host providing `HandoffPermissionService.enqueueOnce` before this
plugin. The optional method preserves ordinary `enqueue` behavior for existing
producers. Its Bull job identity includes tenant, organization, message type and
message ID, and completed/failed jobs are retained for at least 24 hours. A stable
payload ID alone does not deduplicate ordinary Handoff jobs. Old hosts explicitly
reject recovery before changing the card; there is no unsafe fallback to `enqueue`.
For Pro, synchronize the shared Xpert change through the normal release process.

All replicas must load the host and plugin changes before validating new traffic.
Legacy workers do not participate in this protocol. No database migration or
additional GitHub workflow is required. Normal first-message delivery does not
require the new method. This does not automatically replay exhausted old jobs.

## Local regression tests

Start a disposable local Redis and set its URL, then run from `xpertai`:

```sh
LARK_TEST_REDIS_URL=redis://127.0.0.1:6379 \
  LARK_TEST_PLATFORM_ROOT=<xpert-checkout-with-enqueueOnce> \
  NX_DAEMON=false corepack pnpm exec nx test @xpert-ai/plugin-lark \
  --runInBand --testPathPatterns=handoff --skip-nx-cache
```

The Redis suite runs the real state service, callback processor, card renderer,
dispatch service and host `HandoffQueueGatewayService` with real Bull queues in
three separate Node processes. Host permission/context plumbing,
conversation/history persistence and Lark HTTP remain fixtures. It covers parallel
deltas, gap recovery, duplicate/late events, expired owners, transport/cache
failures, tenant isolation, and a subsequent message completing after stale-steer
recovery, lost enqueue acknowledgements before and after job completion, concurrent
distinct follow-ups, failed preparation and old-host rejection. It does not send
messages to Lark or prove production acceptance. Queue assertions inspect actual
Bull jobs rather than a fixture map keyed by payload ID.

External HTTP acceptance and a Redis write are not one transaction: a retry can patch the
same card again; exact-once delivery through the existing text fallback is not
claimed. The host contract deduplicates producer retries within its retention window;
it is not a guarantee of exactly-once model/tool effects after a worker failure.
