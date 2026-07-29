# @xpert-ai/plugin-xmla

XMLA database plugin for Xpert. It preserves the legacy raw SOAP response
contract, basic-auth bootstrap, cookie reuse, one-time 401 retry, custom
headers, and opt-in certificate-verification bypass.

The test suite uses a typed HTTP boundary and does not contact a live XMLA
server. External runtime verification requires an XMLA endpoint and credentials.

This plugin introduces no persisted or global artifacts, so it does not require
a system artifact namespace. The `xmla` key is the existing data-source
protocol identifier.
