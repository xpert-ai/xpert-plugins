# @xpert-ai/plugin-notion-connector

## Shared Connector authentication

This connector uses [`@xpert-ai/connector-runtime`](../../packages/connector-runtime/README.md) for shared authentication infrastructure. The migration retains its provider/auth-method IDs, credential format and vendor-specific adapters. See the shared migration matrix and verification command before releasing.

## SDK compatibility

Notion filter inputs accept a native object or JSON text decoded once, with a
2,048-character limit before decoding. Both forms use the same strict domain
schema; nested values are not decoded or coerced.

The filter boundary uses the published SDK's `jsonEncodedSchema` with
`maxChars: 2048`; there is no connector-local JSON decoder. SDK 3.23.1 or later
is required. Run schema tests, typecheck, build and the dist-first plugin
lifecycle against the published package, without a local SDK source link.
