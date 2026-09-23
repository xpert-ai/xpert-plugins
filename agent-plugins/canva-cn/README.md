# Canva China

Use the existing Xpert Canva Connector account with Canva China MCP.

Official service: https://www.canva.cn/

This is a minimal Xpert-authored Agent Plugins 1.0 package. It does not copy OpenAI Skills or inherit Codex account connections. `plugin.json` declares a logical Connector requirement; `mcp.json` preserves the official endpoint and portable Streamable HTTP transport. The host stores bindings and credentials. See [upstream and migration notes](../docs/UPSTREAM.md).

Install/configure the native Canva Connector and a shared workspace binding first. This package reuses provider `canva`, and enforces the China MCP resource audience. Global Canva REST tokens are incompatible.
