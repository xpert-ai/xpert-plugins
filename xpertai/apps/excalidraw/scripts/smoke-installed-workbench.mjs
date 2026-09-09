import { writeFile, mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { call } from './native-mcp-client.mjs'

const webOrigin = new URL(process.env.XPERT_WEB_URL ?? 'http://localhost:4300').origin
const hostId = process.env.XPERT_ASSISTANT_ID
if (!hostId) throw new Error('Set XPERT_ASSISTANT_ID to an accessible Excalidraw Assistant.')
const { requireAuthentication, createRequestHeaders } = await import(
  pathToFileURL(join(resolve(process.env.XPERT_HOST_CHECKOUT), 'tools/scripts/local-plugin-cli.mjs')).href
)
const options = {
  apiUrl: process.env.XPERT_API_URL ?? 'http://localhost:3333',
  scope: 'organization',
  orgId: process.env.XPERT_ORGANIZATION_ID
}
const auth = await requireAuthentication(options)
const headers = createRequestHeaders(options, auth.token, auth.tenantId)
const base = `${options.apiUrl}/api/view-hosts/agent/${hostId}`
async function api(path, method = 'GET', body) {
  const response = await fetch(base + path, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) })
  if (!response.ok) throw new Error(`Workbench request failed (${response.status}).`)
  const result = await (response.headers.get('content-type')?.includes('text/html') ? response.text() : response.json())
  if (result?.success === false) console.log('Action failure:', result.message)
  return result
}
const manifests = await api('/slots/agent.workbench.main/views')
const manifest = manifests.find((view) => view.source?.provider === 'excalidraw')
assert.ok(manifest)
const viewPath = `/views/${manifest.key}`
const created = await api(`${viewPath}/actions/create_drawing`, 'POST', {
  input: { title: `Workbench MCP acceptance ${new Date().toISOString()}`, kind: 'diagram' }
})
const drawingId = created.data.item.id
await call('excalidraw_add_elements', {
  drawingId,
  operationId: randomUUID(),
  elements: [
    { id: 'mcp-shape', type: 'rectangle', x: 0, y: 0, width: 380, height: 180 },
    { id: 'mcp-label', type: 'text', x: 25, y: 65, fontSize: 28, text: 'Workbench + MCP 同步' }
  ]
})
const html = await api(`${viewPath}/remote-component/entry`)
const payload = await api(`${viewPath}/data?parameters=${encodeURIComponent(JSON.stringify({ drawingId }))}`)
console.log('Initial data:', {
  itemId: payload.item?.id,
  versionId: payload.currentVersion?.id,
  title: payload.item?.title
})
const { chromium } = await import(pathToFileURL(join(resolve(process.argv[2]), 'index.mjs')).href)
const browser = await chromium.launch({ headless: true })
const root = fileURLToPath(new URL('../test-output/mcp/', import.meta.url))
try {
  const page = await browser.newPage({ viewport: { width: 1480, height: 1000 } })
  await page.context().grantPermissions(['local-network-access'], { origin: webOrigin })
  const errors = []
  page.on('websocket', (socket) => socket.on('socketerror', (error) => console.log('WebSocket error:', String(error))))
  page.on('console', (message) => {
    if (message.type() === 'error') console.log('Browser console:', message.text().slice(0, 1000))
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.exposeFunction('viewRequest', async (message) => {
    if (message.type === 'requestData') {
      const query = new URLSearchParams(
        Object.entries(message.query ?? {})
          .filter(([, value]) => value != null)
          .map(([key, value]) => [key, typeof value === 'object' ? JSON.stringify(value) : String(value)])
      )
      return api(`${viewPath}/data?${query}`)
    }
    if (message.type === 'executeAction')
      return api(`${viewPath}/actions/${message.actionKey}`, 'POST', {
        targetId: message.targetId,
        input: message.input,
        parameters: message.parameters
      })
    return {}
  })
  const host = `<!doctype html><meta charset="utf-8"><style>body{margin:0}iframe{width:100%;height:100vh;border:0}</style><iframe id="app" src="/excalidraw-acceptance/app"></iframe><script>
    window.messages=[];const frame=document.querySelector('iframe'),channel='xpertai.remote_component';
    const send=body=>frame.contentWindow.postMessage({channel,protocolVersion:1,instanceId:'acceptance',...body},'*');
    window.addEventListener('message',async event=>{const message=event.data;if(message.channel!==channel)return;window.messages.push({type:message.type,actionKey:message.actionKey,...(message.type==='notify'?{message:message.message}:{})});
      if(message.type==='ready')return send({type:'init',manifest:${JSON.stringify(manifest)},payload:${JSON.stringify(
    payload
  )},locale:'zh-Hans',theme:{mode:'light'}});
      if(message.requestId){try{send({type:'response',requestId:message.requestId,payload:await window.viewRequest(message)})}catch(error){send({type:'error',requestId:message.requestId,message:error.message})}}
    });</script>`
  await page.route(`${webOrigin}/excalidraw-acceptance/**`, (route) =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: new URL(route.request().url()).pathname === '/excalidraw-acceptance/app' ? html : host
    })
  )
  await page.goto(`${webOrigin}/excalidraw-acceptance/`)
  const frame = page.frameLocator('#app')
  try {
    await frame.getByTitle('实时协作已连接', { exact: true }).waitFor({ timeout: 30000 })
  } catch (error) {
    await page.screenshot({ path: join(root, 'workbench-failure.png') })
    console.log('Page errors:', errors)
    console.log('Bridge messages:', await page.evaluate(() => window.messages.slice(-15)))
    console.log((await frame.locator('body').innerText()).slice(0, 5000))
    throw error
  }
  const canvas = frame.locator('canvas.excalidraw__canvas').first()
  await canvas.waitFor({ timeout: 20000 })
  await mkdir(root, { recursive: true })
  await page.screenshot({ path: join(root, 'workbench-before.png') })
  const before = await canvas.screenshot()
  await call('excalidraw_patch_scene', {
    drawingId,
    operationId: randomUUID(),
    updateElements: [
      { id: 'mcp-shape', backgroundColor: '#a5d8ff' },
      { id: 'mcp-label', text: 'MCP 修改已到达画布' }
    ]
  })
  await new Promise((resolve) => setTimeout(resolve, 2000))
  assert.notDeepEqual(await canvas.screenshot(), before)
  // Draw through the real editor, then change a different element through MCP.
  const box = await canvas.boundingBox()
  await frame.locator('canvas.excalidraw__canvas.interactive').click({ position: { x: box.width * 0.7, y: box.height * 0.65 } })
  await page.keyboard.press('r')
  await page.mouse.move(box.x + box.width * 0.68, box.y + box.height * 0.65)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.85, { steps: 12 })
  await page.mouse.up()
  await call('excalidraw_patch_scene', {
    drawingId,
    operationId: randomUUID(),
    updateElements: [{ id: 'mcp-label', text: '协作已同步' }]
  })
  await new Promise((resolve) => setTimeout(resolve, 6500))
  const current = await call('excalidraw_get_drawing', { drawingId, includeScene: true })
  assert.ok(current.elementTotal >= 3, 'The manually drawn element must survive MCP changes and metadata refresh.')
  const label = await call('excalidraw_get_scene_item', { drawingId, itemType: 'element', elementId: 'mcp-label' })
  assert.equal(label.item.text, '协作已同步')
  await page.keyboard.press('Shift+Digit1')
  await page.screenshot({ path: join(root, 'workbench-collaboration.png') })
  await writeFile(
    join(root, 'workbench-acceptance.json'),
    JSON.stringify(
      {
        drawingId,
        sceneRevision: current.sceneRevision,
        elementTotal: current.elementTotal,
        pageErrors: errors,
        passed: true
      },
      null,
      2
    )
  )
  assert.deepEqual(errors, [])
  console.log('Installed Workbench rendered; native MCP changes and manual editor changes persisted together.')
} finally {
  await browser.close()
}
