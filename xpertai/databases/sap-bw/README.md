# @xpert-ai/plugin-sap-bw

SAP Business Warehouse database plugin for Xpert. It preserves the legacy
`sapbw` data-source identity and inherits the public typed XMLA transport,
authentication, cookie, retry, and TLS behavior.

The unit suite uses an in-memory HTTP boundary. A live integration check
requires an SAP BW XMLA endpoint and credentials.

This plugin introduces no persisted or global artifacts, so it does not require
a system artifact namespace. The `sapbw` key is the existing data-source
protocol identifier.
