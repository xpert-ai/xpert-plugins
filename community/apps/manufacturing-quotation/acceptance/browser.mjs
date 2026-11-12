import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { assistantId, credentials, output, request, requiredEnv, saveLocal, view, webOrigin } from './api.mjs'
import { captureWorkbench, chatPath, launchBrowser, signIn, workbench } from './browser-support.mjs'

const image = process.argv.includes('--image')
const keepOcrText = process.argv.includes('--keep-ocr-text')
assert.ok(!keepOcrText || image, '--keep-ocr-text requires --image')
requiredEnv('XPERT_ORG_NAME')
const flow = image ? (keepOcrText ? 'browser-image-ocr' : 'browser-image-edited') : 'browser-text'
const title = `Manufacturing quotation ${flow} ${randomUUID().slice(0, 8)}`
const path = chatPath()
const fixture = fileURLToPath(new URL('./fixtures/synthetic-inquiry.png', import.meta.url))
const totalCny = image ? '14.64' : '15.51'
const screenshots = []
let phase = 'verify the published Workbench'
let browser
let page
let modelEvidence

async function capture(app, suffix) {
  screenshots.push(await captureWorkbench(app, `${flow}-${suffix}.png`))
  if (image && suffix === 'review') {
    const filename = `${flow}-platform.png`
    await page.screenshot({ path: fileURLToPath(new URL(filename, output)), animations: 'disabled' })
    screenshots.push(filename)
  }
}

async function confirmVisible(app) {
  await app.getByRole('heading', { name: /^(已确认报价|Confirmed quotation)$/ }).waitFor({ timeout: 30_000 })
  await app.getByText(new RegExp(`^(CN)?¥${totalCny.replace('.', '\\.')}$`)).waitFor()
  await app.getByRole('heading', { name: title, exact: true }).waitFor()
}

try {
  const relations = encodeURIComponent(JSON.stringify({ relations: ['copilotModel'] }))
  const assistant = await request(`/xpert/${assistantId}/team?data=${relations}`)
  modelEvidence = { assistantId, version: assistant.version, model: assistant.copilotModel.model }
  await request(`/view-hosts/agent/${assistantId}/views/${view}/data`)
  phase = 'launch browser'
  browser = await launchBrowser()
  page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1520, height: 930 } })
  phase = 'sign in and select organization'
  await signIn(page, credentials, path)
  phase = 'open Workbench'
  await page.goto(`${webOrigin}${path}`, { waitUntil: 'domcontentloaded' })
  const app = await workbench(page)
  phase = 'enter the synthetic inquiry'
  await app.getByRole('button', { name: /^(新建询价|New inquiry)$/ }).click()
  await app.getByRole('textbox', { name: /^(询价标题|Inquiry title)$/ }).fill(title)

  let inquiry = `玛钢 90°弯头，规格 25，${image ? '黑袋 ' : ''}1 箱；玛钢三通，规格 25，1 箱。`
  let imageSrc
  if (image) {
    phase = 'upload PNG and verify OCR'
    await app.getByRole('tab', { name: /^(图片|Image)$/ }).click()
    await app.getByLabel(/^(询价图片|Inquiry image)$/).setInputFiles(fixture)
    await app.getByRole('button', { name: /^(上传并识别文字|Upload and extract text)$/ }).click()
    await app.getByRole('heading', { name: /^(询价原图|Original inquiry image)$/ }).waitFor({ timeout: 125_000 })
    imageSrc = await app.getByRole('img', { name: /synthetic-inquiry\.png/ }).getAttribute('src')
    assert.ok(imageSrc?.startsWith('data:image/png;'))
    const recognized = app.getByRole('textbox', { name: /^(识别文字|Recognized text)$/ }).and(app.locator(':enabled'))
    await recognized.waitFor({ timeout: 100_000 })
    const ocrText = await recognized.inputValue()
    for (const product of ['弯头', '三通', '黑袋']) assert.ok(ocrText.includes(product))
    await capture(app, 'ocr')
    if (keepOcrText) inquiry = ocrText.trim()
    else await recognized.fill(inquiry)
    await app.getByRole('button', { name: /^(保存文字并识别商品|Save text and identify items)$/ }).click()
  } else {
    await app.getByRole('textbox', { name: /^(询价原文|Inquiry text)$/ }).fill(inquiry)
    await app.getByRole('button', { name: /^(保存并识别商品|Save and identify items)$/ }).click()
  }

  phase = 'verify real model candidates'
  await app.getByRole('heading', { name: /^(审核候选明细|Review items)$/ }).waitFor({ timeout: 105_000 })
  const quote = app.getByRole('heading', { name: /^(已确认报价|Confirmed quotation)$/ })
  assert.equal(await quote.count(), 0)
  const proposals = await Promise.all([1, 2].map(async (line) => {
    const product = app.getByRole('textbox', { name: new RegExp(`^(第 ${line} 行产品名|Product name on line ${line})$`) })
    const grade = app.getByRole('combobox', { name: new RegExp(`^(第 ${line} 行等级|Grade on line ${line})$`) })
    return [await product.inputValue(), (await grade.innerText()).trim()]
  }))
  assert.deepEqual(proposals.sort(), [['90°弯头', image ? 'a' : 'b'], ['三通', 'b']])
  const cartons = app.getByRole('textbox', { name: /^(第 \d+ 行箱数|Cartons on line \d+)$/ })
  assert.equal(await cartons.count(), 2)
  assert.deepEqual(await Promise.all((await cartons.all()).map((input) => input.inputValue())), ['1', '1'])
  await capture(app, 'review')

  phase = 'reject invalid quantity and confirm'
  const confirm = app.getByRole('button', { name: /^(确认并计算报价|Confirm and calculate quote)$/ })
  const invalidQuantity = app.getByText(/^(每行箱数须为 1 到 1,000,000 的整数。|Enter a whole number from 1 to 1,000,000 cartons on every line\.)$/)
  await cartons.first().fill('0')
  await invalidQuantity.waitFor()
  assert.equal(await confirm.isEnabled(), false)
  assert.equal(await quote.count(), 0)
  await capture(app, 'validation')
  await cartons.first().fill('1')
  await confirm.click()
  await confirmVisible(app)

  phase = 'reload and verify persisted quotation'
  await page.reload({ waitUntil: 'domcontentloaded' })
  const restored = await workbench(page)
  await confirmVisible(restored)
  await restored.locator('p.manufacturing-inquiry').and(restored.getByText(inquiry, { exact: true })).waitFor()
  if (image) {
    const restoredImage = restored.getByRole('img', { name: /synthetic-inquiry\.png/ })
    assert.equal(await restoredImage.getAttribute('src'), imageSrc)
  }
  await capture(restored, 'reloaded')
  await saveLocal(`${flow}-result.json`, { success: true, ...modelEvidence, title, inquiry, totalCny, proposals, invalidQuantityRejected: true, reloaded: true, screenshots })
  console.log(`PASS ${flow}: ${totalCny} CNY persisted after refresh`)
} catch {
  // Playwright and HTTP errors can carry sensitive input. Report only the failing step.
  await saveLocal(`${flow}-result.json`, { success: false, ...modelEvidence, title, phase, screenshots })
  console.error(`FAIL ${flow} during ${phase}`)
  process.exitCode = 1
} finally {
  await browser?.close()
}
