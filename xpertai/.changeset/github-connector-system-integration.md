---
'@xpert-ai/plugin-github-connector': patch
---

Support selecting or creating a GitHub system integration in the connector dialog. Resolve the selected application using the connection's persisted tenant and organization scope for authorization, callbacks and refresh, while retaining legacy credential compatibility. Declare the GitHub MCP resource so the host can route Agent Plugin connections through GitHub App OAuth or PAT instead of dynamic client registration.

Deploy the companion platform connector update before enabling the new integration-selection and MCP adapter flows. Existing hosts retain their previous integration lookup behavior.
