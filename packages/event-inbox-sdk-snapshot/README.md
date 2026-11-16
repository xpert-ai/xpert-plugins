# Event Inbox SDK snapshot

Procurement Quote Comparison builds against `3.36.0-event-inbox.1` for the follow-up wake contract and branch references. The packer pins the source digest of both platform packages. The community workspace locks both archives by SHA-512 integrity and resolves the SDK's Contracts dependency to the same archive. Code Review and Lark build against the registry release `3.36.0`. All three plugins use the host's SDK at runtime.

For the event source contract, type declarations, and plugin examples, see the [Event Inbox plugin guide](../../docs/event-inbox.md).

To reproduce the archives, use a source checkout matching the pinned source digest with its frozen dependencies installed. Node 22.17.1 and npm 10.9.2 were used for this snapshot.

```sh
node packages/event-inbox-sdk-snapshot/pack.mjs "$XPERT_PLATFORM_ROOT" "$OUTPUT_DIR"
```

Switch the procurement development dependencies and community lockfile to registry releases that include the follow-up wake contract and branch references. Remove the snapshot override and these archives together.
