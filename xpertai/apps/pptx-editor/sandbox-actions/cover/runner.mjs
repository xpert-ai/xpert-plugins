import { readFile, mkdir, stat, realpath } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

/** Only static, materialized slide HTML is accepted; the browser has no scripts or network. */
export async function renderCover({ requestPath, outputPath }) {
  const request = JSON.parse(await readFile(requestPath, 'utf8'))
  if (request.contractVersion !== '1' || request.action !== 'pptx.cover' || request.actionVersion !== '1.0.0'
    || !request.payload || typeof request.payload !== 'object' || Array.isArray(request.payload) || Object.keys(request.payload).length)
    throw new Error('EXPORT_INPUT_INVALID: Invalid PPTX cover request')
  const inputPath = join(dirname(requestPath), 'slide.html')
  if ((await stat(inputPath)).size > 20 * 1024 * 1024) throw new Error('EXPORT_INPUT_INVALID: Preview too large')
  const html = await readFile(inputPath, 'utf8')
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block',
      viewport: { width: 688, height: 2160 }, deviceScaleFactor: 1 })
    await context.route('**/*', route => route.abort())
    const page = await context.newPage()
    page.setDefaultTimeout(10000)
    await page.setContent(html, { waitUntil: 'load', timeout: 10000 })
    const slide = page.locator('section > div').first()
    if (await slide.count() === 0) throw new Error('EXPORT_INPUT_INVALID: Slide bounds unavailable')
    const box = await slide.boundingBox()
    if (!box || box.width < 100 || box.height < 50 || box.height > 2000)
      throw new Error('EXPORT_INPUT_INVALID: Slide bounds unavailable')
    await mkdir(outputPath, { recursive: true })
    await slide.screenshot({ path: join(outputPath, 'cover.png'), type: 'png', animations: 'disabled', timeout: 10000 })
  } finally { await browser.close() }
}

if (process.argv[1] && await realpath(process.argv[1]) === await realpath(fileURLToPath(import.meta.url))) {
  const argument = name => process.argv[process.argv.indexOf(name) + 1]
  const requestPath = argument('--request'), outputPath = argument('--output')
  if (!process.argv.includes('--request') || !process.argv.includes('--output') || !requestPath || !outputPath)
    throw new Error('EXPORT_INPUT_INVALID: Expected request and output paths')
  renderCover({ requestPath, outputPath }).catch(error => {
    process.stderr.write(`EXPORT_CONVERSION_FAILED: ${error instanceof Error ? error.message : 'Cover unavailable'}\n`)
    process.exitCode = 1
  })
}
