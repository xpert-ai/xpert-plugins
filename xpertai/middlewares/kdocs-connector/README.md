# WPS Docs connector

`@xpert-ai/plugin-kdocs-connector` connects an Xpert workspace to WPS Cloud Docs through WPS SkillHub browser sign-in and its remote MCP service.

Source: [xpert-ai/xpert-plugins](https://github.com/xpert-ai/xpert-plugins/tree/main/xpertai/middlewares/kdocs-connector)

The connector opens the WPS account page, polls a five-minute one-time authorization session, stores the resulting access token in the platform vault, and exposes a bounded Agent tool surface for file discovery, document reads and writes, spreadsheet ranges, and Workspace Files transfer.

## Setup and connection

1. Install this workspace package through the standard Xpert plugin deployment flow and enable it for the target organization.
2. Open **Connectors**, select **WPS Docs / 金山文档**, and choose **WPS web sign-in**.
3. Complete the sign-in and authorization on the WPS-hosted page. Xpert polls the one-time authorization for up to five minutes and stores the returned token in its credential vault.
4. Add the connected WPS Docs middleware to an Agent and grant only the tools needed by that Agent.

No WPS client ID or client secret is configured in Xpert. The user needs a WPS account with access to the documents they want the Agent to use. Network access is required to `account.wps.cn`, `api.wps.cn`, and `mcp-center.wps.cn`.

## Tools

The connector provides tools to search and list cloud files; inspect metadata and links; read, create, rename, move, and copy files; read and update smart documents; inspect sheets, read and update ranges, and append rows; and transfer files between WPS Docs and Xpert Workspace Files. Destructive file deletion is intentionally not exposed.

WPS file and drive identifiers returned by discovery tools should be passed unchanged to subsequent operations. Uploads and downloads are limited to 20 MiB, and returned document content is limited to 100,000 characters.

## Security and data handling

The WPS access token is declared as a user credential and is resolved only at runtime. It is never included in Agent tool output. Tool calls send the requested file metadata or content to the WPS SkillHub MCP service; upload and download operations also process the selected Workspace File. The connector does not independently collect analytics or retain document content.

Disconnect the connector in Xpert to remove the stored credential. WPS-side session revocation and account access remain controlled by WPS.

## Development

```bash
corepack pnpm exec nx run @xpert-ai/plugin-kdocs-connector:typecheck
corepack pnpm exec nx run @xpert-ai/plugin-kdocs-connector:test
corepack pnpm exec nx run @xpert-ai/plugin-kdocs-connector:build
```

## Production status

The SkillHub authentication and MCP endpoints match the current WPS-hosted flow used by the public WPS Docs Skill. A production deployment still requires WPS approval for third-party product access, the Xpert request-source identifier, token lifecycle, revocation, scopes, SLA, and data-processing terms. The plugin intentionally does not send WorkBuddy's request-source header.
