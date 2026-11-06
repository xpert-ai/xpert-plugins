import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const preview = join(root, 'scripts/preview')
const port = Number(process.env.PORT || 4173)
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8'
}
const routes = {
  '/app.js': join(root, 'src/lib/remote-components/resume-match/app.js'),
  '/app.css': join(root, 'src/lib/remote-components/resume-match/app.css'),
  '/preview-parent.js': join(preview, 'preview-parent.js'),
  '/preview-fixture.mjs': join(preview, 'preview-fixture.mjs'),
  '/react.js': join(root, 'node_modules/react/umd/react.production.min.js'),
  '/react-dom.js': join(root, 'node_modules/react-dom/umd/react-dom.production.min.js')
}
const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://127.0.0.1:${port}`)
  let file = routes[url.pathname]
  if (!file) {
    if (url.pathname === '/' || url.pathname === '/index.html') file = join(preview, 'preview-host.html')
    else if (url.pathname === '/frame' || url.pathname === '/frame.html') file = join(preview, 'preview-frame.html')
    else {
      const asset = normalize(join(root, 'assets', url.pathname.replace(/^\/assets\//, '')))
      if (url.pathname.startsWith('/assets/') && asset.startsWith(join(root, 'assets'))) file = asset
    }
  }
  if (!file) {
    response.writeHead(404)
    response.end('Not found')
    return
  }
  try {
    const info = await stat(file)
    if (!info.isFile()) throw new Error('not a file')
    const data = await readFile(file)
    response.writeHead(200, {
      'content-type': mime[extname(file)] || 'application/octet-stream',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    })
    response.end(data)
  } catch (error) {
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
    response.end(`预览资源加载失败：${file}\n${error instanceof Error ? error.message : ''}`)
  }
})
server.listen(port, '127.0.0.1', () => {
  console.log(`简历智能匹配本地预览：http://127.0.0.1:${port}/`)
})
