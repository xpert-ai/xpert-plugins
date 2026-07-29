# @xpert-ai/plugin-trino

Trino database plugin for Xpert. It preserves the legacy `trino` strategy and
uses the public, typed Presto runner contract with Trino client headers and
Trino JDBC metadata.

The unit suite uses a typed in-memory client boundary. A live Trino integration
check requires an external coordinator and credentials.

This plugin introduces no persisted or process-global artifacts, so it does not
need a system artifact namespace. The `trino` key is the existing data-source
protocol identifier.
