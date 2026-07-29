# @xpert-ai/plugin-hive

Apache Hive database plugin for Xpert. It preserves the legacy `hive` strategy,
HiveServer2 JDBC metadata, Thrift query execution, schema/table/column discovery,
and authentication configuration.

Tests use a typed runtime boundary. Live verification requires a HiveServer2
endpoint and credentials. No system artifact namespace is required because the
plugin registers no persisted or process-global artifacts.
