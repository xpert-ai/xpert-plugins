#!/usr/bin/env node
/**
 * Minimal stand-in host for the ticket-triage remote component.
 *
 * Why this exists: the platform's own Workbench shell lives behind the app
 * platform configuration (`APP_PLATFORM_FILE` / `APP_PLATFORM_ENVIRONMENT_FILE`).
 * When that is not configured, the Cloud UI redirects `/chat/*` to `/apps`, so
 * the plugin's view cannot be opened through the product shell in a local
 * installation. This host implements exactly the documented remote component
 * protocol (handshake -> requestData -> executeAction -> resize) and forwards
 * every call to the platform's real `view-hosts` endpoints. No data is faked:
 * the component, the rows and the actions all come from the plugin.
 *
 * Usage:
 *   XPERT_API_URL=http://127.0.0.1:3000 \
 *   XPERT_EMAIL=you@example.com XPERT_PASSWORD=... \
 *   XPERT_TENANT_ID=<uuid> XPERT_ORG_ID=<uuid> XPERT_XPERT_ID=<uuid> \
 *   node tests/browser/serve-host.mjs
 *
 * Serves on http://127.0.0.1:4310 by default (HOST_PORT to change).
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pluginRoot = resolve(here, '..', '..')
const componentPath = join(pluginRoot, 'dist', 'remote', 'ticket-triage.html')
const hostPagePath = join(here, 'host.html')

const apiBase = process.env.XPERT_API_URL ?? 'http://127.0.0.1:3000'
const port = Number(process.env.HOST_PORT ?? 4310)
const config = {
  email: process.env.XPERT_EMAIL ?? '',
  password: process.env.XPERT_PASSWORD ?? '',
  tenantId: process.env.XPERT_TENANT_ID ?? '',
  organizationId: process.env.XPERT_ORG_ID ?? '',
  xpertId: process.env.XPERT_XPERT_ID ?? '',
  viewKey: process.env.XPERT_VIEW_KEY ?? 'ticket_triage.board__ticket_triage.board-view'
}

const missing = ['email', 'password', 'tenantId', 'organizationId', 'xpertId'].filter((key) => !config[key])
if (missing.length) {
  console.error(`[serve-host] missing env: ${missing.join(', ')}`)
  process.exit(1)
}

const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' })
  res.end(body)
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)

  if (url.pathname === '/' || url.pathname === '/index.html') {
    const html = await readFile(hostPagePath, 'utf8')
    const injected = `<script>window.__HOST_CONFIG__ = ${JSON.stringify(config)}</script>`
    return send(res, 200, html.replace('</head>', `${injected}</head>`), 'text/html; charset=utf-8')
  }

  if (url.pathname === '/component.html') {
    try {
      return send(res, 200, await readFile(componentPath, 'utf8'), 'text/html; charset=utf-8')
    } catch (error) {
      return send(res, 500, `build the plugin first (dist/remote/ticket-triage.html): ${String(error)}`, 'text/plain; charset=utf-8')
    }
  }

  if (url.pathname.startsWith('/api/')) {
    const target = `${apiBase}${url.pathname}${url.search}`
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    // forward every header (Authorization, tenant-id, organization-id, x-scope-level, ...)
    const headers = {}
    for (const [key, value] of Object.entries(req.headers)) {
      if (key === 'host' || key === 'content-length' || key === 'connection') continue
      if (value !== undefined) headers[key] = Array.isArray(value) ? value.join(',') : value
    }
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks)
    })
    const body = Buffer.from(await upstream.arrayBuffer())
    res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' })
    return res.end(body)
  }

  return send(res, 404, 'not found', 'text/plain; charset=utf-8')
})

server.listen(port, '127.0.0.1', () => {
  console.log(`[serve-host] http://127.0.0.1:${port}  api=${apiBase}  xpert=${config.xpertId}`)
  console.log('[serve-host] component:', componentPath)
})
