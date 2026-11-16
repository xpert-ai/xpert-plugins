import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { ProcurementQuoteComparisonViewProvider } from '../../community/apps/procurement-quote-comparison/dist/lib/procurement-quote-comparison-view.provider.js'

const host = process.env.XPERT_EVENT_HOST_ROOT
test('buyer manages a deadline in the packed procurement remote view', { skip: !host }, async (t) => {
  const { chromium, expect } = createRequire(resolve(host, 'package.json'))('@playwright/test')
  const provider = new ProcurementQuoteComparisonViewProvider()
  const { html } = await provider.getRemoteComponentEntry({}, 'workbench', {
    entry: 'procurement_quote_comparison__remote'
  })
  const browser = await chromium.launch()
  t.after(() => browser.close())
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.setContent('<iframe title="Procurement" style="width:100%;height:95vh;border:0"></iframe>')
  await page.evaluate((html) => {
    const frame = document.querySelector('iframe')
    const channel = 'xpertai.remote_component'
    const item = { id: 'case', title: 'Pump procurement', status: 'reviewing' }
    const risk = { id: 'risk', title: 'Late pump delivery', followUp: { state: 'unscheduled', version: 0 } }
    window.actions = []
    window.publishCheck = (check) => Object.assign(risk.followUp, check)
    window.showWake = (wakeStatus) => {
      risk.followUp = {
        ...risk.followUp,
        state: risk.followUp.state === 'waiting' ? 'fired' : risk.followUp.state,
        wakeStatus
      }
    }
    const send = (data) =>
      frame.contentWindow.postMessage({ channel, instanceId: 'one', protocolVersion: 1, ...data }, '*')
    window.locale = (locale) => send({ type: 'init', locale })
    window.addEventListener('message', ({ source, data }) => {
      if (source !== frame.contentWindow || data.channel !== channel) return
      if (data.type === 'ready') return window.locale('en')
      if (data.type === 'requestData')
        return send({
          type: 'data',
          requestId: data.requestId,
          data: data.query.parameters?.caseId ? { item: { case: item, risks: [risk] } } : { items: [item], total: 1 }
        })
      if (data.type === 'executeAction') {
        window.actions.push(data.input)
        const input = data.input
        risk.followUp = {
          state: { set: 'waiting', cancel: 'cancelled', reply: 'answered' }[input.action],
          wakeStatus: risk.followUp.wakeStatus,
          dueAt: input.dueAt,
          version: input.expectedVersion + 1
        }
        send({ type: 'actionResult', requestId: data.requestId, data: { success: true } })
      }
    })
    frame.srcdoc = html
  }, html)
  const view = page.frameLocator('iframe')
  await view.getByRole('button', { name: /Pump procurement/ }).click({ timeout: 10000 })
  const input = view.getByLabel('Follow-up deadline')
  const year = new Date().getFullYear() + 1
  await input.fill(year + '-03-05T14:30')
  await page.evaluate(() => window.locale('zh-Hans'))
  await expect(view.getByLabel('跟进截止时间')).toHaveValue(year + '-03-05T14:30')
  await view.getByRole('button', { name: '设定期限' }).click()
  await expect(view.getByText('等待答复', { exact: false })).toBeVisible()
  await view.getByLabel('跟进截止时间').fill(year + '-03-06T14:30')
  await view.getByRole('button', { name: '改期' }).click()
  const refresh = view.getByRole('button', { name: /刷新/ })
  await page.waitForFunction(() => window.actions.length === 2)
  await page.evaluate(() => window.showWake('queued'))
  await refresh.click()
  await expect(view.getByText('本次已决定的跟进：等待运行')).toBeVisible()
  await expect(view.getByText(/本次已决定的运行仍会启动或继续/)).toBeVisible()
  await view.getByRole('button', { name: '取消跟进' }).click()
  await expect(view.getByText('本次已决定的跟进：等待运行')).toBeVisible()
  await expect(view.getByText('已取消', { exact: true })).toBeVisible()
  await view.getByLabel('跟进截止时间').fill(year + '-03-07T14:30')
  await view.getByRole('button', { name: '设定期限' }).click()
  await view.getByLabel('供应商答复（选填）').fill('Confirmed by supplier')
  await view.getByRole('button', { name: '登记答复' }).click()
  await expect(view.getByText('已收到答复', { exact: true })).toBeVisible()
  await page.evaluate(() => window.showWake('started'))
  await expect(view.getByText('本次已决定的跟进：已启动')).toBeVisible({ timeout: 8000 })
  await expect(view.getByText('已收到答复', { exact: true })).toBeVisible()
  const directory = process.env.XPERT_EVENT_VIEW_EVIDENCE_DIR
  const check = directory
    ? JSON.parse(await readFile(resolve(directory, 'procurement-check.json'), 'utf8'))
    : {
        quoteRevision: 2,
        reminderId: 'one-check',
        publishedAt: '2026-11-16T10:30:00Z',
        workbenchPublication: 'published',
        replyNote: 'Supplier confirmed'
      }
  await page.evaluate((check) => window.publishCheck(check), check)
  await refresh.click()
  await expect(view.getByText('报价修订 2')).toBeVisible()
  await expect(view.getByText(/在本案例发布「待核实交期」提醒/)).toHaveCount(1)
  await expect(view.getByText('供应商答复：Supplier confirmed')).toBeVisible()
  await refresh.click()
  await expect(view.getByText(/在本案例发布「待核实交期」提醒/)).toHaveCount(1)
  const unverified = directory
    ? JSON.parse(await readFile(resolve(directory, 'procurement-unknown-check.json'), 'utf8'))
    : {
        state: 'fired',
        quoteRevision: 4,
        quoteVersionStatus: 'unverified',
        workbenchPublication: 'unknown',
        reminderId: null,
        publishedAt: null
      }
  await page.evaluate((check) => window.publishCheck(check), unverified)
  await refresh.click()
  await expect(view.getByText('当前报价版本待核实')).toBeVisible()
  await expect(view.getByText('报价修订 4')).toBeVisible()
  await expect(view.getByText(/在本案例发布「待核实交期」提醒/)).toHaveCount(0)
  await expect(view.getByRole('button', { name: '改期' })).toHaveCount(0)
  await expect(view.getByRole('button', { name: '登记答复' })).toBeVisible()
  const actions = await page.evaluate(() => window.actions)
  assert.deepEqual(
    actions.map((a) => [a.expectedVersion, a.action]),
    [
      [0, 'set'],
      [1, 'set'],
      [2, 'cancel'],
      [3, 'set'],
      [4, 'reply']
    ]
  )
  assert.equal(actions.at(-1).replyNote, 'Confirmed by supplier')
  assert.deepEqual(errors, [])
})
