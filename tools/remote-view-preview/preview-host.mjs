import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'

const CHANNEL = 'xpertai.remote_component'
const PROTOCOL_VERSION = 1

export async function startRemoteViewPreview(config, options = {}) {
  const componentRoot = resolve(config.component.root)
  const workspaceRoot = resolve(config.workspaceRoot)
  const requireFromWorkspace = createRequire(join(workspaceRoot, 'package.json'))
  const sdk = requireFromWorkspace('@xpert-ai/plugin-sdk')
  const reactRoot = dirname(requireFromWorkspace.resolve('react/package.json'))
  const reactDomRoot = dirname(requireFromWorkspace.resolve('react-dom/package.json'))
  const [appScript, appCss, reactUmd, reactDomUmd] = await Promise.all([
    readFile(join(componentRoot, 'app.js'), 'utf8'),
    readFile(join(componentRoot, 'app.css'), 'utf8'),
    readFile(join(reactRoot, 'umd', 'react.production.min.js'), 'utf8'),
    readFile(join(reactDomRoot, 'umd', 'react-dom.production.min.js'), 'utf8')
  ])
  const iframeHtml = sdk.renderRemoteReactIframeHtml({
    title: config.title,
    appScript,
    appCss,
    reactUmd,
    reactDomUmd,
    lang: config.hostContext.locale ?? 'en'
  })
  const state = structuredClone(config.state)
  const events = []
  const hostHtml = renderHostHtml({
    title: config.title,
    instanceId: config.instanceId,
    hostContext: config.hostContext
  })
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      if (request.method === 'GET' && url.pathname === '/') {
        return send(response, 200, 'text/html; charset=utf-8', hostHtml)
      }
      if (request.method === 'GET' && url.pathname === '/__xpert/component') {
        return send(response, 200, 'text/html; charset=utf-8', iframeHtml)
      }
      if (request.method === 'GET' && url.pathname === '/favicon.ico') {
        response.writeHead(204, { 'cache-control': 'no-store' })
        return response.end()
      }
      if (request.method === 'GET' && url.pathname === '/__xpert/remote-view-preview/state') {
        return sendJson(response, 200, { state, events })
      }
      if (request.method === 'POST' && url.pathname === '/__xpert/bridge') {
        const message = await readJson(request)
        const result = await config.handleRequest(message, { state, events })
        return sendJson(response, 200, result)
      }
      if (request.method === 'POST' && url.pathname === '/__xpert/event') {
        const message = await readJson(request)
        events.push(message)
        if (config.handleEvent) await config.handleEvent(message, { state, events })
        return sendJson(response, 200, { accepted: true })
      }
      sendJson(response, 404, { error: 'not_found' })
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : 'preview_host_error'
      })
    }
  })
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(options.port ?? 0, options.host ?? '127.0.0.1', resolveListen)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Preview Host did not bind a TCP port.')
  return {
    url: `http://${address.address}:${address.port}/`,
    state,
    events,
    close: () => new Promise((resolveClose, rejectClose) => {
      server.close((error) => error ? rejectClose(error) : resolveClose())
    })
  }
}

function renderHostHtml({ title, instanceId, hostContext }) {
  const init = {
    channel: CHANNEL,
    protocolVersion: PROTOCOL_VERSION,
    instanceId,
    type: 'init',
    ...hostContext
  }
  return `<!doctype html>
<html lang="${escapeHtml(hostContext.locale ?? 'en')}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      html, body { margin: 0; min-height: 100%; background: #f4f2ed; }
      #remote-view { display: block; width: 100%; min-height: 900px; border: 0; }
    </style>
  </head>
  <body>
    <iframe id="remote-view" title="${escapeHtml(title)}" src="/__xpert/component"></iframe>
    <script>
      (() => {
        const channel = ${JSON.stringify(CHANNEL)}
        const version = ${PROTOCOL_VERSION}
        const instanceId = ${JSON.stringify(instanceId)}
        const init = ${safeJson(init)}
        const frame = document.getElementById('remote-view')
        window.XpertRemoteViewPreview = {
          emitHostEvent(event) {
            frame.contentWindow.postMessage({
              channel,
              protocolVersion: version,
              instanceId,
              type: 'hostEvent',
              payload: event
            }, '*')
          }
        }
        window.addEventListener('message', async (event) => {
          const message = event.data
          if (!message || message.channel !== channel || message.protocolVersion !== version) return
          if (message.type === 'ready') {
            frame.contentWindow.postMessage(init, '*')
            return
          }
          if (message.type === 'resize' && Number.isFinite(message.height)) {
            frame.style.height = Math.max(720, message.height) + 'px'
            return
          }
          if (message.type === 'notify') {
            await fetch('/__xpert/event', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(message)
            })
            return
          }
          if (!message.requestId) return
          try {
            const response = await fetch('/__xpert/bridge', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(message)
            })
            const result = await response.json()
            if (!response.ok) throw new Error(result.error || 'Preview bridge request failed.')
            frame.contentWindow.postMessage({
              channel,
              protocolVersion: version,
              instanceId,
              requestId: message.requestId,
              type: 'response',
              ...result
            }, '*')
          } catch (error) {
            frame.contentWindow.postMessage({
              channel,
              protocolVersion: version,
              instanceId,
              requestId: message.requestId,
              type: 'error',
              message: error instanceof Error ? error.message : 'Preview bridge request failed.'
            }, '*')
          }
        })
      })()
    </script>
  </body>
</html>`
}

async function readJson(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function sendJson(response, status, value) {
  send(response, status, 'application/json; charset=utf-8', JSON.stringify(value))
}

function send(response, status, contentType, body) {
  response.writeHead(status, {
    'content-type': contentType,
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'self' 'unsafe-inline'; frame-src 'self'; connect-src 'self'"
  })
  response.end(body)
}

function safeJson(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c')
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
