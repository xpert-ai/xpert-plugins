// Real Vue, View, and Python validation with transport interruption injected by the host.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import { createPreviewHost } from './preview-host.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const host = await createPreviewHost()
const browser = await chromium.launch({
  executablePath: process.env.FUNDS_QUERY_BROWSER || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox']
})
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } })
page.setDefaultTimeout(20000)
const errors = []
page.on('pageerror', error => errors.push(error.message))
let checks = 0
async function check(name, run) {
  await run()
  checks++
  console.log('PASS', name)
}

try {
  host.setRuntimeStatus({status:'unavailable',pythonVersion:null,message:'需要服务器安装 Python 3.11 或更高版本。'})
  await page.goto(host.url)
  const frame = page.frameLocator('iframe')
  const fileInput = frame.getByLabel('选择标准交易 Excel')
  const alert = frame.getByRole('alert')
  const importFile = name => fileInput.setInputFiles(join(root, 'examples', name))
  const refresh = () => frame.locator('.page-header').getByRole('button', { name: '刷新', exact: true }).click()
  const expectValidation = async () => {
    await alert.getByText('发现 3 行错误，未导入任何交易。', { exact: true }).waitFor()
    assert.equal(await alert.locator('li').count(), 3)
    const details = await alert.locator('li').allTextContents()
    assert.match(details[0], /第 3 行.*金额/)
    assert.match(details[1], /第 4 行.*付款账号/)
    assert.match(details[2], /第 5 行.*交易编号重复/)
  }
  await check('an unavailable runtime shows recovery instructions before any data request', async () => {
    await alert.getByText('需要服务器安装 Python 3.11 或更高版本。', {exact:true}).waitFor()
    assert.equal(host.requests.filter(request => request.operation === 'chat').length, 0)
    assert.equal((await host.service.context(host.scope)).datasets.total, 0)
  })
  await check('refresh after environment repair resumes normal import and displays readiness', async () => {
    host.setRuntimeStatus(null)
    await refresh()
    await frame.getByRole('heading', { name: '让数据回答你的问题' }).waitFor()
    await frame.getByText(/运行环境已就绪 · Python/).waitFor()
    assert.equal(await alert.count(), 0)
  })
  await check('invalid first upload reports exact rows and leaves an empty dataset list', async () => {
    await importFile('交易明细-错误样例.xlsx')
    await expectValidation()
    assert.equal((await host.service.context(host.scope)).datasets.total, 0)
    assert.equal(await frame.getByRole('heading', { name: '让数据回答你的问题' }).count(), 1)
  })
  let datasetId, sessionId
  await check('a valid retry clears import errors and creates the standard dataset', async () => {
    await importFile('交易明细-标准样例.xlsx')
    await frame.getByRole('heading', { name: '这次想了解资金的哪一面？' }).waitFor()
    assert.equal(await alert.count(), 0)
    const context = await host.service.context(host.scope)
    datasetId = context.currentDataset.id
    sessionId = (await host.service.view(host.scope, 'chat', { datasetId })).session.id
    assert.match(await frame.getByLabel('数据集概览').innerText(), /102,566.91/)
  })
  await check('invalid upload preserves the selected dataset, conversation, and draft', async () => {
    await frame.getByLabel('你想了解这批交易的什么？').fill('保留这段草稿')
    await importFile('交易明细-错误样例.xlsx')
    await expectValidation()
    assert.equal((await host.service.context(host.scope)).currentDataset.id, datasetId)
    assert.equal((await host.service.view(host.scope, 'chat', { datasetId })).session.id, sessionId)
    assert.equal(await frame.getByLabel('你想了解这批交易的什么？').inputValue(), '保留这段草稿')
  })
  await check('a background read failure cannot overwrite actionable import validation', async () => {
    host.failNextRead('chat')
    const response = page.waitForResponse(async response => {
      if (!response.url().endsWith('/rpc') || response.status() !== 500) return false
      return (await response.json()).message === 'Simulated read failure'
    })
    await page.evaluate(() => window.emitPreviewEvent())
    await response
    await expectValidation()
    await refresh()
    await expectValidation()
  })
  await check('cancelled upload offers a readable recovery step and never retries automatically', async () => {
    const before = host.requests.filter(request => request.type === 'executeFileAction').length
    host.failNextImport('AbortError: Request cancelled.')
    await importFile('交易明细-错误样例.xlsx')
    await alert.getByText('文件导入未完成，请先刷新确认数据集，再重新选择文件重试。', { exact: true }).waitFor()
    assert.doesNotMatch(await alert.innerText(), /AbortError|Request cancelled/)
    assert.equal(await alert.locator('li').count(), 0)
    await refresh()
    assert.equal(host.requests.filter(request => request.type === 'executeFileAction').length, before + 1)
    assert.equal((await host.service.context(host.scope)).datasets.total, 1)
  })
  await check('reselecting the same invalid file after cancellation restores precise row diagnostics', async () => {
    await importFile('交易明细-错误样例.xlsx')
    await expectValidation()
    assert.equal((await host.service.context(host.scope)).datasets.total, 1)
  })
  await check('an empty workbook is rejected and a subsequent valid upload recovers cleanly', async () => {
    await importFile('标准导入模板.xlsx')
    await alert.getByText(/没有交易/).waitFor()
    assert.equal(await alert.locator('li').count(), 0)
    await importFile('交易明细-标准样例.xlsx')
    await frame.getByText('已复用相同文件的数据集。', { exact: true }).waitFor()
    assert.equal(await alert.count(), 0)
    assert.equal((await host.service.context(host.scope)).datasets.total, 1)
  })
  await mkdir(join(root, 'test-results'), { recursive: true })
  await importFile('交易明细-错误样例.xlsx')
  await expectValidation()
  await page.screenshot({ path: join(root, 'test-results/import-validation.png'), fullPage: true })
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ importChecks: checks, pythonBacked: true, modelCalls: 0 }))
} finally {
  await browser.close()
  await host.close()
}
