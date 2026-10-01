# Sentry

Investigate issues and errors in authorized Sentry organizations.

Official service: https://mcp.sentry.dev/

This is a minimal Xpert-authored Agent Plugins 1.0 package. It does not copy OpenAI Skills or inherit Codex account connections. `plugin.json` declares a logical Connector requirement; `mcp.json` preserves the official endpoint and portable Streamable HTTP transport. The host stores bindings and credentials. See [upstream and migration notes](../docs/UPSTREAM.md).

Each user connects their own account via Connector OAuth. Installing the package does not authorize third-party data access.
