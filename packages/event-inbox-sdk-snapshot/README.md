# Event Inbox SDK snapshot

Procurement Quote Comparison, Code Review and Lark build against `3.36.0-outbox.5`. The SDK adds a scoped output source and private-channel delivery operations. Contracts includes versioned output references, recipient-specific result fields and the notification protocol. Both workspaces lock the archives by SHA-512 and resolve the SDK's Contracts dependency to the same archive. The host supplies the runtime SDK. The packer verifies the combined source digest before building.

For the event source contract, type declarations, and plugin examples, see the [Event Inbox plugin guide](../../docs/event-inbox.md).

To reproduce the archives, use a source checkout matching the pinned source digest with its frozen dependencies installed. Node 22.17.1 and npm 10.9.2 were used for this snapshot.

```sh
node packages/event-inbox-sdk-snapshot/pack.mjs "$XPERT_PLATFORM_ROOT" "$OUTPUT_DIR"
```

Once an official release contains these contracts, update all three development dependencies, both workspace overrides and both lockfiles together. Verify the host build and the three plugin lifecycles against that release.
