# Event Inbox SDK snapshot

Procurement Quote Comparison uses `3.36.0-workbench-decision.1` to submit workbench decisions through `platform.view.workbench-decision`. Code Review and Lark use `3.36.0-outbox.5`. The SDK adds versioned human decisions on a scoped output source, authenticated private replies and interactive channel delivery. A decision uses the existing output reference for request identity and business revision. The source defines the choices and commits the outcome. Contracts includes versioned output references, recipient-specific result fields and the notification protocol. Both workspaces lock the archives by SHA-512 and resolve the SDK's Contracts dependency to the same archive. The host supplies the runtime SDK. The packer verifies the combined source digest before building.

For the event source contract, type declarations, and plugin examples, see the [Event Inbox plugin guide](../../docs/event-inbox.md).

To reproduce the archives, use a source checkout matching the pinned source digest with its frozen dependencies installed. Node 22.17.1 and npm 10.9.2 were used for this snapshot.

```sh
node packages/event-inbox-sdk-snapshot/pack.mjs "$XPERT_PLATFORM_ROOT" "$OUTPUT_DIR"
```

Once an official release contains these contracts, update all three development dependencies, both workspace overrides and both lockfiles together. Verify the host build and the three plugin lifecycles against that release.
