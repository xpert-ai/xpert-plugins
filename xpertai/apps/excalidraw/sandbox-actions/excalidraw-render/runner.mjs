import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve, join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const bundle = dirname(fileURLToPath(import.meta.url))
const arg = name => { const index = process.argv.indexOf(name); if (index < 0 || !process.argv[index + 1]) throw new Error('render_input_invalid'); return resolve(process.argv[index + 1]) }
let browser
try {
  const requestPath = arg('--request'), output = arg('--output')
  const request = JSON.parse(await readFile(requestPath, 'utf8'))
  if (request.contractVersion !== '1' || request.action !== 'excalidraw.render' || request.actionVersion !== '1.0.0' || !['preview','export','mermaid'].includes(request.payload?.kind) || !['json','svg','png'].includes(request.payload?.format)) throw new Error('render_contract_invalid')
  const bytes = await readFile(join(dirname(requestPath), 'scene.json'))
  if (bytes.length > 32 * 1024 * 1024) throw new Error('render_input_too_large')
  const scene = JSON.parse(bytes.toString('utf8'))
  if (!Array.isArray(scene.elements) || scene.elements.length > 5000) throw new Error('render_input_invalid')
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage({ viewport: { width: 2400, height: 1800 }, deviceScaleFactor: 1 })
  await page.route('**/*', async route => {
    const url = new URL(route.request().url()), name = decodeURIComponent(url.pathname).slice(1)
    if (url.origin !== 'http://excalidraw.action' || name.includes('..') || name.includes('\\')) return route.abort()
    if (!name) return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta charset="utf-8"></head><body><script>window.EXCALIDRAW_ASSET_PATH="http://excalidraw.action/"</script><script src="browser.js"></script></body></html>'})
    if (name !== 'browser.js' && !/^fonts\/[\w/.-]+\.woff2$/.test(name)) return route.abort()
    try { await route.fulfill({contentType:extname(name)==='.woff2'?'font/woff2':'text/javascript',body:await readFile(join(bundle,name))}) } catch { await route.abort() }
  })
  await page.goto('http://excalidraw.action')
  await page.waitForFunction(() => typeof window.renderDrawing === 'function')
  const result = await page.evaluate(async ({input,scene}) => window.renderDrawing(input,scene), {input:request.payload,scene})
  const name = request.payload.kind === 'mermaid' ? 'converted.json' : `drawing.${request.payload.format}`
  const resultBytes = Buffer.from(result,request.payload.kind !== 'mermaid' && request.payload.format === 'png' ? 'base64' : 'utf8')
  if (!resultBytes.length || resultBytes.length > 32 * 1024 * 1024) throw new Error('render_output_invalid')
  await mkdir(output,{recursive:true})
  await writeFile(join(output,name),resultBytes)
} catch (error) {
  // Keep user scene contents, filesystem paths and Mermaid text out of logs.
  process.stderr.write(`${error instanceof Error && /^render_|^conversion_/.test(error.message) ? error.message : 'render_failed'}\n`)
  process.exitCode = 1
} finally { await browser?.close() }
