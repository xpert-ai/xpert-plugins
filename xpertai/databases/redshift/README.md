# @xpert-ai/plugin-redshift

Amazon Redshift database plugin for Xpert. It preserves the legacy `redshift`
configuration and Data API transport, while waiting for statement completion
and mapping typed records to object rows before schema conversion.

Tests use a typed Data API boundary. Live verification requires AWS credentials
and a Redshift cluster. No system artifact namespace is required.
