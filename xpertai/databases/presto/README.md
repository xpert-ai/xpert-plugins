# @xpert-ai/plugin-presto

Presto database plugin for Xpert. It preserves the legacy `presto` data-source
type and provides query execution, schema discovery, JDBC metadata, basic
authentication, and TLS client configuration.

## Validation

The unit suite uses a typed in-memory client boundary and does not require a
live Presto coordinator. A live integration check requires connection
credentials and is intentionally separate from the deterministic plugin
lifecycle test.

This plugin does not declare a system artifact namespace because it introduces
no persisted entities, routes, queues, controllers, or other global artifacts.
The `presto` strategy key is the existing data-source protocol identifier.
