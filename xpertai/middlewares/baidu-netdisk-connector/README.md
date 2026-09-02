# Baidu Netdisk Connector

Tenant-scoped Xpert middleware connector for Baidu Netdisk. It follows the WorkBuddy-style connection flow: a tenant administrator configures a Baidu OAuth application in **System Integration**, and an end user clicks Connect to open Baidu's official authorization page. The end user never enters `AppKey` or `SecretKey` in the connector UI.

The plugin's tenant configuration contains only path, capability, and operation-limit defaults. OAuth application credentials are stored in a tenant-level **Baidu Netdisk OAuth** System Integration and are read through the platform permission service.

The first release includes:

- Platform-managed OAuth authorization-code flow with refresh-token rotation
- Workspace-scoped runtime credentials resolved through `ConnectorRuntime:baidu-netdisk`
- Quota and user information
- Bounded directory listing, document/image/video listing, exact file metadata, keyword search, and semantic search
- Guarded folder creation, copy, move, rename, and explicitly confirmed delete
- Three-step/rapid upload from Xpert Workspace Files and bounded UTF-8 text upload
- Application-folder path policy (`/apps/xpert` by default), bounded pagination, response limits, and stable errors
- Allowlisted Agent DTOs that omit access tokens, refresh tokens, raw provider payloads, and thumbnail URLs

URL transfer and sharing are not exposed until their Baidu service contracts are enabled and verified in production. The plugin does not present non-functional controls.

See [`docs/`](./docs/) for setup, architecture, operations, and verification.

## Development

```bash
pnpm exec nx run @xpert-ai/plugin-baidu-netdisk-connector:build
pnpm exec nx run @xpert-ai/plugin-baidu-netdisk-connector:typecheck
pnpm exec nx exec -- jest --config middlewares/baidu-netdisk-connector/jest.config.ts --runInBand
```
