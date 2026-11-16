# Event Inbox SDK snapshot

Code Review, Procurement Quote Comparison and Lark build against the platform's Event Inbox API. The npm release of `@xpert-ai/plugin-sdk@3.35.0` predates that API. The two archives here are development dependencies for `3.36.0-event-inbox.1`. The packer pins the source digest of both platform packages, including the follow-up wake contract and branch references. Both pnpm workspaces lock their SHA-512 integrity and resolve the SDK's Contracts dependency to the same archive. The plugins use the host's SDK at runtime.

For the event source contract, type declarations, and plugin examples, see the [Event Inbox plugin guide](../../docs/event-inbox.md).

To reproduce the archives, use a source checkout matching the pinned source digest with its frozen dependencies installed. Node 22.17.1 and npm 10.9.2 were used for this snapshot.

```sh
node packages/event-inbox-sdk-snapshot/pack.mjs "$XPERT_PLATFORM_ROOT" "$OUTPUT_DIR"
```

Switch the three development manifests and both lockfiles to the matching registry releases when the SDK and Contracts with Event Inbox become available. Remove the snapshot-specific overrides and these archives together.
