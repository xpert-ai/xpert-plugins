import { createServer } from 'node:http'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import config from './preview.config.mjs'

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { startRemoteViewPreview } = await import(pathToFileURL(resolve(pluginRoot, '../../../tools/remote-view-preview/preview-host.mjs')).href)

/** Reuse the repository host. This wrapper only labels the simulated environment. */
export async function startPreview(fixture = config, port = 0) {
  const host = await startRemoteViewPreview(fixture, { port: 0 })
  const server = createServer(async (request, response) => {
    try {
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      const upstream = await fetch(new URL(request.url ?? '/', host.url), { method: request.method, headers: { 'content-type': 'application/json' }, ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) })
      const contentType = upstream.headers.get('content-type') ?? 'text/plain'
      let body = await upstream.text()
      if (request.url === '/') body = body.replace('<body>', '<body><div id="preview-notice" role="note"><strong>界面演示 / UI preview</strong><span>合成测试数据 · 模拟 AI · 尚未连接真实 Xpert / Synthetic data, simulated AI</span></div><style>html,body{height:100%;min-height:0}#preview-notice{box-sizing:border-box;height:42px;display:flex;align-items:center;gap:16px;padding:8px 20px;background:#fff7ed;color:#9a3412;border-bottom:1px solid #fed7aa;font:12px/1.4 system-ui,sans-serif}#preview-notice strong{white-space:nowrap;font-weight:600}#preview-notice span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#remote-view{height:calc(100vh - 42px)!important;min-height:0!important}</style>')
      response.writeHead(upstream.status, { 'content-type': contentType, 'cache-control': 'no-store' })
      response.end(body)
    } catch (error) { response.writeHead(500); response.end(error instanceof Error ? error.message : 'preview_error') }
  })
  await new Promise(resolveListen => server.listen(port, '127.0.0.1', resolveListen))
  return { state: host.state, events: host.events, url: `http://127.0.0.1:${server.address().port}/`, close: async () => { await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose())); await host.close() } }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = await startPreview(config, Number(process.env.PORT ?? 4417))
  console.log(`Synthetic UI preview (no real AI): ${host.url}`)
}
