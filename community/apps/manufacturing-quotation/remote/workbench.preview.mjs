import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import test from 'node:test'

// This fixture exercises the generated iframe with a simulated host. The
// installed Xpert platform and real Assistant are separate acceptance checks.
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.MANUFACTURING_PLAYWRIGHT_MODULE ?? 'playwright')
const assets = new URL('../dist/remote/', import.meta.url)

function fixtureHost() {
  const frame = document.querySelector('iframe')
  const channel = 'xpertai.remote_component'
  const instanceId = 'preview-only'
  const scopeRevision = 1
  const version = 'a'.repeat(64)
  const products = [
    ['demo-elbow-25-a', '90°弯头', 'a'],
    ['demo-elbow-25-A', '90°弯头', 'A'],
    ['demo-elbow-25-b', '90°弯头', 'b'],
    ['demo-tee-25-b', '三通', 'b'],
  ].map(([id, productName, priceMarker]) => ({
    id, category: '玛钢', productName, specification: '25', priceMarker, aliases: [], status: 'enabled',
  }))
  const rawOcr = '玛钢 90°弯头，规格 25，1 箱；玛钢三通，规格 25，1 箱。'
  const correctedOcr = '玛钢 90°弯头，规格 25，黑袋 1 箱；玛钢三通，规格 25，1 箱。'
  let saved
  let sendCount = 0
  let reads = 0
  let creates = 0
  let confirms = 0
  const failures = []
  const send = (type, payload = {}) => frame.contentWindow.postMessage({
    channel, protocolVersion: 1, instanceId, scopeRevision, type, ...payload,
  }, '*')
  const init = (locale = 'zh-Hans', mode = 'light', density = 'default', debug) => send('init', {
    initialQuery: {},
    locale,
    debug,
    theme: { mode, density, tokens: { colorBorder: mode === 'dark' ? 'rgb(62, 71, 82)' : 'rgb(220, 225, 233)' } },
  })
  const patch = (values) => {
    saved = { ...saved, ...values, revision: saved.revision + 1 }
    return saved
  }
  window.fixture = {
    init,
    state: () => ({ saved, sendCount, reads, creates, confirms, failures }),
    reopen: () => { frame.src = '/remote?reopened' },
  }
  window.addEventListener('message', (event) => {
    if (event.source !== frame.contentWindow || event.data?.channel !== channel) return
    const { type, requestId, input, actionKey, payload, commandKey, targetId, query, file } = event.data
    if (type === 'ready') return init()
    if (type === 'resize') return
    const check = (value, reason) => { if (!value) failures.push(reason) }
    check(event.data.instanceId === instanceId && event.data.scopeRevision === scopeRevision, 'Bridge scope mismatch')
    const reply = (kind, values) => send(kind, { requestId, ...values })
    if (type === 'requestData') {
      reads++
      check(!query.parameters || query.parameters.draftId === saved?.id, 'Unexpected selected draft ID')
      return reply('data', { data: { summary: {
        catalog: { catalogVersion: version, synthetic: true, products },
        serviceError: null,
        records: saved ? [saved] : [], selected: saved ?? null,
      } } })
    }
    if (type === 'invokeClientCommand') {
      check(commandKey === 'assistant.chat.send_message' && payload.text === 'Synthetic preview proposal request',
        'Assistant dispatch did not send the expected command and text')
      check(payload.newThread === true, 'Assistant dispatch must start a new conversation')
      sendCount++
      if (sendCount === 1) return reply('clientCommandResult', { result: { success: false, code: 'unsupported' } })
      reply('clientCommandResult', { result: { success: true } })
      if (saved.inquiry === rawOcr.replace('，1 箱；', '；')) {
        patch({ status: 'failed', retryAt: null, errorCode: 'analysis_failed' })
        return send('hostEvent', { event: { type: 'assistant.tool.completed', toolName: 'manufacturing_report_failure' } })
      }
      patch({ status: 'review', retryAt: null, lines: [
        { category: '玛钢', productName: '90°弯头', specification: '25', quantityCartons: 1,
          priceMarker: saved.source ? 'a' : 'b', gradeRaw: saved.source ? '黑袋' : '', evidence: saved.inquiry.split('；')[0],
          ...(saved.source ? { correctionReason: '对照原图补回黑袋字样' } : {}) },
        { category: '玛钢', productName: '三通', specification: '25', quantityCartons: 1,
          priceMarker: 'b', gradeRaw: '', evidence: '玛钢三通，规格 25，1 箱' },
      ] })
      return send('hostEvent', { event: { type: 'assistant.tool.completed', toolName: 'manufacturing_save_proposal' } })
    }
    if (type === 'executeFileAction') {
      check(actionKey === 'create_image' && file.name === 'preview-inquiry.png' && file.type === 'image/png' &&
        file.size === file.buffer.byteLength, 'Image bytes and metadata must be transferred by the file action')
      const now = new Date().toISOString()
      saved = {
        id: input.requestId, title: input.title, inquiry: '', revision: 1, status: 'ocr_failed',
        catalogVersion: version, createdAt: now, updatedAt: now, lines: [], quote: null, retryAt: null, errorCode: 'ocr_failed',
        source: { type: 'image', fileName: file.name, mimeType: file.type,
          dataUrl: 'data:image/png;base64,' + btoa(String.fromCharCode(...new Uint8Array(file.buffer))) },
      }
      return reply('fileActionResult', { result: { success: true, data: { draft: saved } } })
    }
    check(type === 'executeAction', 'Unexpected bridge request')
    const success = (draft, extra) => reply('actionResult', { result: { success: true, data: { draft, ...extra } } })
    if (actionKey === 'create') {
      creates++
      check(/^[a-f0-9-]{36}$/.test(input.requestId), 'Create request ID was not a UUID')
      const now = new Date().toISOString()
      saved = { id: input.requestId, title: input.title, inquiry: input.inquiry, revision: 1,
        status: 'draft', catalogVersion: version, createdAt: now, updatedAt: now,
        lines: [], quote: null, retryAt: null, errorCode: null,
      }
      return success(saved)
    }
    check(targetId === saved.id && input.id === saved.id && input.revision === saved.revision, 'Mutation missed record or revision')
    if (actionKey === 'retry_ocr') {
      return success(patch({ status: 'draft', inquiry: rawOcr, errorCode: null, source: { ...saved.source, ocrText: rawOcr } }))
    }
    if (actionKey === 'save_inquiry') {
      check(input.inquiry === (saved.source ? correctedOcr : rawOcr), 'Correction must be saved before candidate dispatch')
      return success(patch({ inquiry: input.inquiry, status: 'draft', lines: [], errorCode: null, retryAt: null }))
    }
    if (actionKey === 'analyze' || actionKey === 'retry') {
      if (saved.status !== 'analyzing') patch({ status: 'analyzing', retryAt: new Date(Date.now() + 120_000).toISOString() })
      return success(saved, { chatMessage: 'Synthetic preview proposal request' })
    }
    if (actionKey === 'save_lines') return success(patch({ lines: input.lines }))
    if (actionKey === 'confirm') {
      confirms++
      check(saved.status === 'review' && input.lines[0].quantityCartons === 3 &&
        input.lines[0].priceMarker === 'a' && input.lines[0].gradeRaw === 'a', 'Quote must follow human review')
      if (confirms === 1) {
        patch({ lines: input.lines, errorCode: 'pricing_unavailable' })
        return reply('actionResult', { result: { success: false, data: { errorCode: 'pricing_unavailable' } } })
      }
      return success(patch({ status: 'quoted', errorCode: null, lines: input.lines, quote: {
        catalogVersion: version, synthetic: true, currency: 'CNY',
        lines: [
          { productId: products[0].id, category: '玛钢', productName: '90°弯头', specification: '25', priceMarker: 'a',
            status: 'priced', quantityCartons: 3, packingQuantity: 7, totalPieces: 21, unitPrice: '0.103', lineAmount: '2.17' },
          { productId: products[3].id, category: '玛钢', productName: '三通', specification: '25', priceMarker: 'b',
            status: 'priced', quantityCartons: 1, packingQuantity: 13, totalPieces: 13, unitPrice: '1.07', lineAmount: '13.91' },
        ],
        total: '16.08',
      } }))
    }
    failures.push(`Unexpected action ${actionKey}`)
  })
  frame.src = '/remote'
}

test('synthetic preview exercises dispatch recovery, inquiry correction, confirmation and reopen', { timeout: 70_000 }, async (t) => {
  const appJs = await readFile(new URL('app.js', assets), 'utf8')
  const appCss = await readFile(new URL('app.css', assets), 'utf8')
  const zhHans = JSON.parse(await readFile(new URL('locales/zh-Hans.json', import.meta.url), 'utf8'))
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost')
    const send = (type, body) => res.writeHead(200, { 'Content-Type': type }).end(body)
    if (url.pathname === '/remote') return send('text/html; charset=utf-8', `<!doctype html>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>${appCss}</style><div id="root"></div>
      <script type="module">${appJs.replaceAll('</script', '<\\/script')}</script>`)
    if (url.pathname === '/favicon.ico') return res.writeHead(204).end()
    return send('text/html; charset=utf-8', `<!doctype html><title>Synthetic manufacturing quotation workbench preview</title>
      <iframe sandbox="allow-forms allow-scripts" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe>
      <script>(${fixtureHost.toString()})()</script>`)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => { server.close() })
  const browser = await chromium.launch({
    channel: process.env.MANUFACTURING_BROWSER_CHANNEL,
    executablePath: process.env.MANUFACTURING_BROWSER_PATH,
  })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1180, height: 760 } })
  const browserErrors = []
  const debugMessages = []
  t.after(() => { if (browserErrors.length) t.diagnostic(browserErrors.join('\n')) })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
    if (message.type() === 'debug' && message.text().startsWith('[manufacturing-quotation]')) debugMessages.push(message.text())
  })
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  const frame = page.frameLocator('iframe')
  await frame.getByRole('heading', { name: '针对管件铸造企业的报价助手', exact: true }).waitFor()
  const save = frame.getByRole('button', { name: '保存并识别商品' })
  await save.waitFor({ timeout: 15_000 }).catch(async (error) => {
    t.diagnostic(await frame.locator('body').innerText({ timeout: 2_000 }))
    throw error
  })
  assert.equal(await save.isEnabled(), false)
  assert.deepEqual(debugMessages, [], 'Bridge logging is disabled by default')
  const enabledLog = page.waitForEvent('console', (message) => message.text().startsWith('[manufacturing-quotation] init'))
  await page.evaluate(() => window.fixture.init('zh-Hans', 'light', 'default', { enabled: true, production: false }))
  await enabledLog
  const logCount = debugMessages.length
  await page.evaluate(() => window.fixture.init('en-US', 'light', 'default', { enabled: false }))
  await frame.getByRole('heading', { name: 'Quotation assistant for pipe fitting foundries', exact: true }).waitFor()
  assert.equal(debugMessages.length, logCount, 'Host opt-out disables bridge logging')
  await page.evaluate(() => window.fixture.init())
  await save.waitFor()
  await frame.getByRole('button', { name: '填入示例' }).click()
  const inquiry = frame.getByRole('textbox', { name: '询价原文' })
  const validInquiry = await inquiry.inputValue()
  const missingQuantity = validInquiry.replace('，1 箱；', '；')
  await inquiry.fill(missingQuantity)
  await save.click()
  await frame.getByText('助理未确认接收请求。', { exact: false }).waitFor()
  await frame.getByRole('button', { name: '重试识别' }).click()
  await frame.getByRole('alert').getByText(zhHans['error.analysis_failed']).waitFor()
  assert.equal(await inquiry.inputValue(), missingQuantity)
  const failedId = (await page.evaluate(() => window.fixture.state())).saved.id
  await inquiry.fill(' ')
  const saveCorrection = frame.getByRole('button', { name: '保存文字并识别商品' })
  assert.equal(await saveCorrection.isEnabled(), false)
  await inquiry.fill(validInquiry)
  await saveCorrection.click()
  await frame.getByRole('heading', { name: '审核候选明细' }).waitFor()
  const recovered = await page.evaluate(() => window.fixture.state())
  assert.equal(recovered.saved.id, failedId)
  assert.equal(recovered.saved.inquiry, validInquiry)
  const qty = frame.getByRole('textbox', { name: '第 1 行箱数' })
  const confirm = frame.getByRole('button', { name: '确认并计算报价' })
  const grade = frame.getByRole('combobox', { name: '第 1 行等级' })
  const product = frame.getByRole('textbox', { name: '第 1 行产品名' })
  assert.equal(await product.inputValue(), '90°弯头')
  const screenshotDir = process.env.MANUFACTURING_PREVIEW_OUTPUT
  await grade.click()
  const option = frame.getByRole('option', { name: /^A$/ })
  await option.waitFor()
  const rect = await option.boundingBox()
  assert.ok(rect && rect.x >= 0 && rect.y >= 0 && rect.y + rect.height <= 760, 'Select must open within the iframe')
  if (screenshotDir) await page.screenshot({ path: join(screenshotDir, 'manufacturing-preview-select.png') })
  await page.keyboard.press('Escape')
  await option.waitFor({ state: 'hidden' })
  await grade.and(frame.locator(':focus')).waitFor({ timeout: 3_000 })
  await grade.click()
  await frame.getByRole('option', { name: /^a$/ }).click()
  assert.equal(await grade.innerText(), 'a')
  await frame.getByRole('button', { name: '添加明细' }).click()
  await frame.getByRole('combobox', { name: '第 3 行分类' }).click()
  await frame.getByRole('option', { name: '玛钢', exact: true }).click()
  await frame.getByRole('textbox', { name: '第 3 行产品名' }).fill('90°弯头')
  await frame.getByRole('textbox', { name: '第 3 行规格' }).fill('25')
  await frame.getByRole('textbox', { name: '第 3 行箱数' }).fill('1')
  await frame.getByRole('combobox', { name: '第 3 行等级' }).click()
  await frame.getByRole('option', { name: /^a$/ }).click()
  assert.equal(await confirm.isEnabled(), true, 'A repeated product may remain on its own line')
  await frame.getByRole('button', { name: '移除第 3 行' }).click()
  await qty.fill('1.5')
  assert.equal(await confirm.isEnabled(), false)
  await qty.fill('3')
  await frame.getByRole('button', { name: '保存修改' }).click()
  await frame.getByText('修改已保存').waitFor()
  await frame.getByText('有未保存的修改').waitFor({ state: 'hidden' })
  await confirm.and(frame.locator(':enabled')).waitFor()
  assert.equal(await frame.getByRole('button', { name: '保存修改' }).isEnabled(), false)
  if (screenshotDir) await page.screenshot({ path: join(screenshotDir, 'manufacturing-preview-review.png') })
  await page.evaluate(() => window.fixture.reopen())
  await frame.getByRole('heading', { name: '审核候选明细' }).waitFor()
  assert.equal(await qty.inputValue(), '3')
  await confirm.click()
  await frame.getByText('计价暂不可用。请稍后重试。', { exact: true }).waitFor()
  await confirm.click()
  await frame.getByRole('heading', { name: '已确认报价' }).waitFor()
  await frame.getByText('¥16.08', { exact: true }).waitFor()
  assert.match(await frame.getByRole('table', { name: '已确认报价' }).innerText(), /2\.17/)
  await page.evaluate(() => window.fixture.reopen())
  await frame.getByRole('heading', { name: '已确认报价' }).waitFor()
  const beforeLocale = await page.evaluate(() => window.fixture.state())
  await page.evaluate(() => window.fixture.init('en-US', 'dark', 'compact'))
  await frame.getByRole('heading', { name: 'Quotation assistant for pipe fitting foundries', exact: true }).waitFor()
  await frame.getByRole('heading', { name: 'Confirmed quotation' }).waitFor()
  assert.equal(await frame.locator('html').getAttribute('data-xui-density'), 'compact')
  assert.equal(await frame.locator('html').evaluate((node) => getComputedStyle(node).getPropertyValue('--border').trim()), 'rgb(62, 71, 82)')
  const state = await page.evaluate(() => window.fixture.state())
  assert.equal(state.reads, beforeLocale.reads, 'A language-only init should not reload business data')
  assert.deepEqual([state.creates, state.sendCount, state.confirms, state.saved.status], [1, 3, 2, 'quoted'])
  assert.deepEqual(state.failures, [])
  await page.setViewportSize({ width: 420, height: 720 })
  await frame.getByRole('button', { name: 'Hide inquiries' }).click()
  assert.equal(await frame.locator('main').evaluate((node) => node.scrollWidth <= node.clientWidth), true)
  const totalRect = await frame.getByText('CN¥16.08', { exact: true }).boundingBox()
  assert.ok(totalRect && totalRect.x + totalRect.width <= 420, 'Quote total must be visible without horizontal scrolling')
  if (screenshotDir) await page.screenshot({ path: join(screenshotDir, 'manufacturing-preview-quote-compact.png') })

  await page.setViewportSize({ width: 1180, height: 760 })
  await page.evaluate(() => window.fixture.init())
  await frame.getByRole('button', { name: '新建询价' }).click()
  await frame.getByRole('textbox', { name: '询价标题' }).fill('图片演示')
  await frame.getByRole('tab', { name: '图片', exact: true }).click()
  const imageInput = frame.getByLabel('询价图片', { exact: true })
  const upload = frame.getByRole('button', { name: '上传并识别文字' })
  await imageInput.setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('invalid') })
  await frame.getByRole('alert').getByText('请选择不超过 5 MB 的 PNG、JPEG 或 WebP 图片。').waitFor()
  assert.equal(await upload.isEnabled(), false)
  await imageInput.setInputFiles({ name: 'preview-inquiry.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfD8AAAAASUVORK5CYII=', 'base64') })
  await upload.click()
  await frame.getByRole('img', { name: '询价图片 preview-inquiry.png' }).waitFor()
  await frame.getByRole('button', { name: '重试图片识别' }).click()
  const recognized = frame.getByRole('textbox', { name: '识别文字' })
  await recognized.and(frame.locator(':enabled')).waitFor()
  assert.match(await recognized.inputValue(), /玛钢三通/)
  assert.equal((await page.evaluate(() => window.fixture.state())).sendCount, 3, 'OCR must not dispatch candidate analysis')
  await recognized.fill('玛钢 90°弯头，规格 25，黑袋 1 箱；玛钢三通，规格 25，1 箱。')
  await frame.getByRole('button', { name: '保存文字并识别商品' }).click()
  await frame.getByRole('heading', { name: '审核候选明细' }).waitFor()
  assert.equal(await frame.getByRole('combobox', { name: '第 1 行等级' }).innerText(), 'a')
  await frame.getByText('候选修正原因：对照原图补回黑袋字样', { exact: true }).waitFor()
  assert.deepEqual((await page.evaluate(() => window.fixture.state())).failures, [])
  assert.deepEqual(browserErrors, [])
})
