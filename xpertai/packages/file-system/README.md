# Xpert Plugin: File System

## Overview

`@xpert-ai/plugin-file-system` adds a document-source provider capable of ingesting content from local disks and popular remote file systems. It registers a NestJS plugin with lifecycle hooks and exposes a strategy that turns discovered files into LangChain `Document` instances that downstream Xpert workflows can consume.

## Features

- Registers the `FileSystemPlugin` NestJS module with bootstrap/shutdown logging and global availability.
- Publishes a `file-system` document-source strategy that advertises metadata for the Xpert catalogue and validates configs before use.
- Supports `local`, `sftp`, `ftp`, `smb`, and `webdav` back ends, recursively crawling directories and emitting documents enriched with path, size, modified date, and source protocol metadata.
- Ships a WebDAV client with HTTPS, self-signed certificate, and `skipForbidden` controls for restricted directories.
- Provides a `test` hook that reuses the loader logic to validate connectivity during integration setup.

## Installation

```bash
npm install @xpert-ai/plugin-file-system
```

> **Peer dependencies:** the host must already provide `@xpert-ai/plugin-sdk`, `@nestjs/common`, `@nestjs/config`, `@metad/contracts`, `@langchain/core`, `chalk`, `zod`, and the respective protocol clients (`basic-ftp`, `ssh2-sftp-client`, `smb2`, `@awo00/smb2`, `webdav`). Review `package.json` for the exact version expectations.

## Configuration

The document-source strategy accepts the following options:

| Option | Type | Required | Description |
| --- | --- | --- | --- |
| `type` | `'local' \| 'ftp' \| 'sftp' \| 'smb' \| 'webdav'` | ✅ | Selects the file-system connector. |
| `filePath` | `string` | ✅ | Absolute path (local) or remote path to read. Directories are crawled recursively. |
| `host` | `string` | ⛔ for `local`, ✅ otherwise | Remote server host name or IP. |
| `port` | `number` | Optional | Defaults to 22 (SFTP), 21 (FTP), 445 (SMB), 80/443 (WebDAV). |
| `username` / `password` | `string` | ⛔ for `local`, ✅ otherwise | Credentials for remote protocols. |
| `https` | `boolean` | WebDAV only | Enables HTTPS when true. |
| `allowSelfSigned` | `boolean` | WebDAV only | Accepts self-signed certificates. |
| `skipForbidden` | `boolean` | WebDAV only | Ignores directories that return HTTP 403. |

Remote connectors perform strict validation so missing host or credentials fail fast. For directories, nodes are emitted as empty-content documents with `metadata.kind = 'directory'`; files include their UTF-8 content and `metadata.kind = 'file'`.

## Usage

Add this plugin to the `PLUGINS` environment variable when starting the XpertAI system, and it will be loaded automatically:

```bash
PLUGINS=@xpert-ai/plugin-file-system
```

Once loaded, create a document source pointing at the desired system. Below is an example payload for the Xpert document ingestion workflow:

```ts
{
  provider: 'file-system',
  options: {
    type: 'sftp',
    filePath: '/docs/product',
    host: 'sftp.example.com',
    port: 22,
    username: 'ingest',
    password: process.env.SFTP_PASSWORD
  }
}
```

During configuration, call the strategy `test` method (available through the plugin host API) to confirm credentials before committing the integration. Successful tests return lightweight metadata describing the discovered files or directories.

### WebDAV example

```ts
{
  provider: 'file-system',
  options: {
    type: 'webdav',
    filePath: '/remote/docs',
    host: 'webdav.example.com',
    port: 443,
    username: 'svc-docs',
    password: process.env.WEBDAV_PASSWORD,
    https: true,
    allowSelfSigned: true,
    skipForbidden: true
  }
}
```

## Development

From the monorepo root (`xpertai/`), build and test with Nx:

```bash
npx nx build @xpert-ai/plugin-file-system
npx nx test @xpert-ai/plugin-file-system
```

Build output lands in `dist/`, and the Jest suite validates the document-source strategy (configured via `jest.config.ts`).

## License

MIT – see the repository root `LICENSE`.
