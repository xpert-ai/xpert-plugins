// Isolated browser/bridge fixture. No Xpert login, real model, or database is used.
// This does not satisfy installed-platform acceptance.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'
const require = createRequire(import.meta.url)
require('reflect-metadata')
const d = require('../dist/lib/domain.js')
const { PaymentViewProvider } = require('../dist/lib/payment-view.provider.js')
const { VIEW, ENTRY } = require('../dist/lib/constants.js')
const zh = JSON.parse(readFileSync(new URL('../remote/locales/zh-Hans.json', import.meta.url)))
const en = JSON.parse(readFileSync(new URL('../remote/locales/en.json', import.meta.url)))
const html = (await new PaymentViewProvider({}).getRemoteComponentEntry({}, VIEW, { entry: ENTRY })).html
const records = new Map()
let context
const now = () => new Date()
const dto = (id, state) => ({
  id,
  ...state,
  sourceLines: d.sourceLines(state.input.source),
  warnings: state.aiResult ? d.warnings(state.input, state.aiResult) : [],
  createdAt: now().toISOString(),
  updatedAt: now().toISOString()
})
function handle(message) {
  if (message.type === 'requestData') {
    const entries = [...records].filter(([, s]) => s.input.customerName.includes(message.query.search || ''))
    const id = message.query.parameters?.recordId
    return {
      type: 'data',
      data: {
        items: entries.map(([id, s]) => ({ id, ...s.input, status: s.status })),
        total: entries.length,
        meta: { page: 1, selected: id && records.has(id) ? dto(id, records.get(id)) : null }
      }
    }
  }
  if (message.type === 'executeAction') {
    const a = message.input
    try {
      let id = a.id
      if (a.kind === 'create') {
        id = randomUUID()
        records.set(id, d.newState(a.input))
      } else if (a.kind === 'start') d.begin(records.get(id), a.revision, randomUUID(), now())
      else if (a.kind === 'confirm') d.confirm(records.get(id), a.revision, a.result, now())
      else if (a.kind === 'cancel') d.fail(records.get(id), a.attemptId, 'user_cancelled', now())
      return { type: 'actionResult', result: { success: true, data: dto(id, records.get(id)) } }
    } catch (error) {
      return { type: 'actionResult', result: { success: false, data: { code: error.code ?? 'invalid_input' } } }
    }
  }
  if (message.type === 'invokeClientCommand') {
    if (message.commandKey === 'assistant.context.set') context = message.payload.context
    else if (message.commandKey === 'assistant.chat.send_message') {
      assert.ok(context?.recordId && context?.attemptId)
      d.submit(
        records.get(context.recordId),
        context.attemptId,
        {
          summary: 'UI 测试固定结果：先付三万，余款待定',
          promises: [{ amountCents: 3000000, paymentDate: '2026-11-06', condition: '', evidenceLineIds: [1] }],
          blockers: [{ description: '验收单未补齐', evidenceLineIds: [2] }],
          questions: ['确认余款日期'],
          suggestedAction: '补齐验收单并确认余款'
        },
        now()
      )
    }
    return { type: 'clientCommandResult', result: { success: true } }
  }
  throw Error('Unexpected bridge request')
}
const shell = `<!doctype html><html><body style="margin:0"><p style="margin:0;padding:12px;background:#fff4cc;color:#222">UI fixture / 模拟宿主与模型输出，仅验证界面，不是实际 Xpert AI 验收</p><iframe title="Plugin fixture" src="/view" style="width:100%;height:1100px;border:0" sandbox="allow-scripts allow-forms"></iframe><script>
const frame=document.querySelector('iframe');const base={channel:'xpertai.remote_component',protocolVersion:1,instanceId:'fixture-1'};
addEventListener('message',async event=>{if(event.source!==frame.contentWindow)return;const m=event.data;if(m.channel!==base.channel)return;if(m.type==='ready'){frame.contentWindow.postMessage({...base,type:'init',locale:new URL(location.href).searchParams.get('locale')||'zh-Hans',initialQuery:{}},'*');return}if(!m.requestId)return;const data=await fetch('/rpc',{method:'POST',body:JSON.stringify(m)}).then(r=>r.json());frame.contentWindow.postMessage({...base,...data,requestId:m.requestId},'*');if(m.type==='invokeClientCommand')frame.contentWindow.postMessage({...base,type:'hostEvent'},'*')});
</script></body></html>`
const server = createServer(async (req, res) => {
  try {
    if (req.url === '/rpc') {
      let body = ''
      for await (const chunk of req) body += chunk
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(handle(JSON.parse(body))))
    } else {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(req.url === '/view' ? html : shell)
    }
  } catch {
    res.statusCode = 500
    res.end('Fixture failure')
  }
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {})
})
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } }),
    errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const url = 'http://127.0.0.1:' + server.address().port
  await page.goto(url)
  const frame = page.frameLocator('iframe')
  await frame.getByRole('button', { name: zh.new, exact: true }).click()
  await frame.getByRole('button', { name: zh.example, exact: true }).click()
  await frame.getByRole('button', { name: zh.save, exact: true }).click()
  await frame.getByRole('button', { name: zh.analyze, exact: true }).click()
  await frame.locator('#summary').waitFor()
  await frame.locator('#amount-0').fill('60000')
  await frame.locator('#followup').fill('2026-11-02')
  await frame.getByRole('button', { name: zh.confirm, exact: true }).click()
  await frame.getByRole('alert').filter({ hasText: zh.amount_exceeds_balance }).waitFor()
  await frame.locator('#amount-0').fill('30000.01')
  await frame.locator('#summary').fill('人工修订 UI fixture')
  await frame.getByRole('button', { name: zh.confirm, exact: true }).click()
  await frame.getByRole('heading', { name: zh.confirmedTitle }).waitFor()
  const saved = [...records.values()][0]
  assert.equal(saved.confirmedResult.analysis.promises[0].amountCents, 3000001)
  await page.reload()
  // The latest record restores automatically after the host remounts.
  await frame.getByRole('heading', { name: zh.confirmedTitle }).waitFor()
  assert.equal(await frame.locator('#summary').inputValue(), '人工修订 UI fixture')
  assert.equal(await frame.locator('#summary').isDisabled(), true)
  if (process.env.PAYMENT_UI_SCREENSHOT)
    await page.screenshot({ path: process.env.PAYMENT_UI_SCREENSHOT, fullPage: true })
  await page.goto(url + '/?locale=en')
  await frame.getByRole('heading', { name: en.title, exact: true, level: 1 }).waitFor()
  assert.deepEqual(errors, [])
  console.log(
    'UI fixture passed: create, bridge dispatch, review, over-balance rejection, edited cents, confirmation, reload, and English locale. No live model tested.'
  )
} finally {
  await browser.close()
  await new Promise((resolve) => server.close(resolve))
}
