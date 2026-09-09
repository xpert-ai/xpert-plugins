import { readFile, mkdir } from 'node:fs/promises'
import { resolve, join, dirname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { client } = await import(pathToFileURL(resolve(process.argv[2])).href)
const { chromium } = await import(pathToFileURL(join(resolve(process.argv[3]), 'index.mjs')).href)
const previous = JSON.parse(await readFile(join(root, 'test-output/mcp/live-workflow.json'), 'utf8'))
const drawingId = previous.find((item) => item.name === 'excalidraw_create_drawing').result.drawingId
const preview = previous.findLast((item) => item.name === 'excalidraw_wait_job').result
const resources = await client.listResources(),
  resource = resources.resources.find((item) => item.uri.endsWith('/excalidraw_preview'))
const html = (await client.readResource({ uri: resource.uri })).contents[0].text
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 780 } })
  await page.exposeFunction('mcpTool', (args) => client.callTool(args))
  const host = `<!doctype html><meta charset="utf-8"><iframe id="app" sandbox="allow-scripts" src="/app" style="width:920px;height:740px;border:0"></iframe><script>
 const iframe=document.querySelector('iframe');window.addEventListener('message',async event=>{const message=event.data;if(message.jsonrpc!=='2.0')return;const send=result=>iframe.contentWindow.postMessage({jsonrpc:'2.0',id:message.id,result},'*');
 if(message.method==='ui/initialize')return send({protocolVersion:message.params.protocolVersion,hostInfo:{name:'Xpert live acceptance',version:'1'},hostCapabilities:{serverTools:{}},hostContext:{theme:'dark',locale:'zh-CN'}});
 if(message.method==='ui/notifications/initialized')return iframe.contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{content:[],structuredContent:${JSON.stringify(
   { drawingId, previewId: preview.previewId }
 )}}},'*');
 if(message.method==='tools/call')return send(await window.mcpTool(message.params));if(message.id!==undefined)send({});});
 </script>`
  await page.addInitScript(() => {
    for (const key of ['localStorage', 'sessionStorage'])
      Object.defineProperty(window, key, {
        get() {
          throw new DOMException('Storage blocked', 'SecurityError')
        }
      })
  })
  await page.route('https://preview.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: new URL(route.request().url()).pathname === '/app' ? html : host
    })
  )
  await page.goto('https://preview.test/')
  const frame = page.frameLocator('#app')
  await frame.locator('#status').filter({ hasText: '预览已就绪' }).waitFor({ timeout: 20000 })
  assert.equal(await frame.locator('#image').evaluate((image) => image.naturalWidth > 0), true)
  await frame.getByRole('button', { name: '放大', exact: true }).click()
  await frame.getByRole('button', { name: '适应画布', exact: true }).click()
  await mkdir(join(root, 'test-output/mcp'), { recursive: true })
  await page.screenshot({ path: join(root, 'test-output/mcp/installed-app.png') })
  console.log(
    'Installed MCP App resource loaded real drawing and authorized PNG via native MCP tools; screenshot saved.'
  )
} finally {
  await browser.close()
  await client.close()
}
