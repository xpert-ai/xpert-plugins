// A credential-free representative View Host using the exact generated plugin assets.
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const port = Number(process.env.WORKBENCH_E2E_PORT ?? 4319)
const assets = { sites: 'apps/sites/dist/lib/remote-components/sites-workbench', review: 'apps/code-review/dist/remote-components/code-review' }
for (const path of Object.values(assets)) for (const name of ['app.js', 'app.css']) readFileSync(resolve(root, path, name))
createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const [kind, name] = url.pathname.slice(1).split('/')
  if (assets[kind] && ['app.js', 'app.css'].includes(name)) {
    res.setHeader('Content-Type', name.endsWith('js') ? 'text/javascript' : 'text/css'); res.end(readFileSync(resolve(root, assets[kind], name))); return
  }
  if (url.pathname === '/host.js') { res.setHeader('Content-Type','text/javascript'); res.end(readFileSync(new URL('./host.js',import.meta.url)));return }
  if (url.pathname !== '/') {res.writeHead(404);res.end();return}
  res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html lang="zh"><meta charset="utf-8"><title>Plugin acceptance host</title><style>body{margin:0;font:14px system-ui;background:#f6f7f9}header{padding:12px;border-bottom:1px solid #ddd}iframe{width:100%;height:calc(100vh - 110px);border:0}pre{margin:0;padding:8px;white-space:pre-wrap;font-size:11px}</style><header>Representative View Host · <a href="?plugin=sites">Sites</a> · <a href="?plugin=review">Code Review</a> <button id="reload">Reload view</button> <button id="deny">Deny next action</button> <button id="scope">Change scope</button></header><iframe id="view" sandbox="allow-scripts"></iframe><pre id="receipt" aria-label="Host receipt"></pre><script type="module" src="/host.js"></script></html>`)
}).listen(port,'127.0.0.1',()=>console.log(`Acceptance host: http://127.0.0.1:${port}`))
