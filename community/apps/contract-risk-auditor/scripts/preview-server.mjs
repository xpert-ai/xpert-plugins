import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import previewConfig from '../src/lib/remote-components/contract_risk_auditor__remote/preview.config.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageRoot = resolve(__dirname, '..')

// 自动加载 .env 文件（如果存在）
const envPath = join(packageRoot, '.env')
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const [k, ...vParts] = trimmed.split('=')
    if (k) process.env[k.trim()] = vParts.join('=').trim()
  }
}
const componentDir = join(packageRoot, 'src', 'lib', 'remote-components', 'contract_risk_auditor__remote')

const CHANNEL = 'xpertai.remote_component'
const PROTOCOL_VERSION = 1
const PORT = Number(process.env.PORT || 4417)

async function start() {
  // 查找 react 和 react-dom umd 文件
  const nodeModulesDir = join(packageRoot, 'node_modules')
  const reactUmd = await readFile(join(nodeModulesDir, 'react', 'umd', 'react.production.min.js'), 'utf8')
  const reactDomUmd = await readFile(join(nodeModulesDir, 'react-dom', 'umd', 'react-dom.production.min.js'), 'utf8')
  const appScript = await readFile(join(componentDir, 'app.js'), 'utf8')

  const title = '商务采购合同智能合规排查工作台 · 本地运行预览'
  const instanceId = 'contract-risk-auditor-preview-instance'

  const renderIframeHtml = (scriptContent) => `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <script>${reactUmd}</script>
    <script>${reactDomUmd}</script>
  </head>
  <body>
    <div id="root"></div>
    <script>${scriptContent}</script>
  </body>
</html>`

  const hostHtml = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      html, body { margin: 0; min-height: 100%; background: #f1f5f9; font-family: sans-serif; }
      .host-header { background: #0f172a; color: #fff; padding: 12px 24px; display: flex; justify-content: space-between; align-items: center; }
      .host-title { font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
      .host-tag { background: #2563eb; color: #fff; font-size: 11px; padding: 2px 8px; border-radius: 4px; }
      .host-tip { font-size: 12px; color: #94a3b8; }
      #remote-view { display: block; width: 100%; height: calc(100vh - 50px); border: 0; }
    </style>
  </head>
  <body>
    <div class="host-header">
      <div class="host-title">
        <span>Xpert 宿主工作台容器模拟</span>
        <span class="host-tag">Remote Component Protocol v1</span>
      </div>
      <div class="host-tip">正在实时预览 @community/apps-contract-risk-auditor · 端口: ${PORT}</div>
    </div>
    <iframe id="remote-view" title="${title}" src="/__xpert/component"></iframe>
    <script>
      (() => {
        const channel = ${JSON.stringify(CHANNEL)}
        const version = ${PROTOCOL_VERSION}
        const instanceId = ${JSON.stringify(instanceId)}
        const init = { channel, protocolVersion: version, instanceId, type: 'init', locale: 'zh-CN' }
        const frame = document.getElementById('remote-view')

        window.addEventListener('message', async (event) => {
          const message = event.data
          if (!message || message.channel !== channel || message.protocolVersion !== version) return

          if (message.type === 'ready') {
            frame.contentWindow.postMessage(init, '*')
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
              type: 'response.error',
              message: error ? error.message : '桥接请求失败'
            }, '*')
          }
        })
      })()
    </script>
  </body>
</html>`

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`)

      if (req.method === 'GET' && url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        const renderedHost = hostHtml.replace('src="/__xpert/component"', `src="/__xpert/component${url.search || ''}"`)
        return res.end(renderedHost)
      }

      if (req.method === 'GET' && url.pathname === '/__xpert/component') {
        const freshAppScript = await readFile(join(componentDir, 'app.js'), 'utf8')
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        return res.end(renderIframeHtml(freshAppScript))
      }

      if (req.method === 'POST' && url.pathname === '/__xpert/bridge') {
        let body = ''
        for await (const chunk of req) body += chunk
        const message = JSON.parse(body)
        const result = await previewConfig.handleRequest(message, { state: previewConfig.state })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify(result))
      }

      res.writeHead(404)
      res.end('Not Found')
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
    }
  })

  server.listen(PORT, () => {
    console.log(`\n=================================================================`)
    console.log(`🚀 合同合规排查工作台 本地运行服务已启动!`)
    console.log(`👉 浏览器打开体验: http://localhost:${PORT}`)
    console.log(`=================================================================\n`)
  })
}

start().catch(err => {
  console.error('启动失败:', err)
  process.exit(1)
})
