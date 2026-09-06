import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { mkdir } from 'node:fs/promises'
import config from '../src/lib/remote-components/governance-workbench/preview.config.mjs'
import { initialState } from '../src/lib/remote-components/governance-workbench/preview-fixture.mjs'
const { startRemoteViewPreview } = await import(resolve(config.workspaceRoot, 'tools/remote-view-preview/preview-host.mjs'))
const require = createRequire(resolve(config.workspaceRoot, 'package.json'))
const { chromium } = require('playwright'), { expect } = require('@playwright/test')
const screenshots = process.env.WORKBENCH_E2E_SCREENSHOT_DIR
function profileConfig(role = 'governance') {
  const sample = initialState().cases[0]
  const item = { id: sample.id, caseKey: sample.caseKey, title: sample.title, kind: sample.kind, status: 'review_required', revision: sample.revision, updatedAt: sample.updatedAt,
    completedTasks: 1, totalTasks: 1, tasks: [], latestActivity: { summary: '已完成跨工厂编码映射，保留合法工厂别名。', at: sample.updatedAt, status: 'succeeded' },
    facts: { sources: 2, drawings: 1, conflicts: 0, exposure: 52000, publications: 0 }, allowedActions: ['coordinator', 'governance'].includes(role) ? ['approve','reject'] : [] }
  const data = { role, mode: 'recent', items: [item], total: 1, page: 1, pageSize: 5, simulation: true, workspaceViewKey: 'material_identity_views__material_identity_evidence_workspace', selected: null }
  return { ...config, title: 'Assistant Profile · built asset integration fixture', isolatedOrigin: true,
    component: { ...config.component, root: resolve(config.component.root, '../assistant-profile') },
    hostContext: { ...config.hostContext, manifest: { key: `material_identity_profile_${role}_recent` }, active: true },
    state: { data, requests: 0, actions: [], commands: [], busy: false, failOnce: false },
    async handleRequest(message, { state }) {
      if (message.type === 'requestData') {
        state.requests++
        const selected = message.query?.selectionId ? { case: state.data.items[0], proposal: sample.proposal, materials: sample.materials, evidence: sample.evidence } : null
        return { data: { ...state.data, selected } }
      }
      if (message.type === 'invokeClientCommand') {
        state.commands.push(message)
        if (message.commandKey === 'assistant.profile.interaction') state.busy = message.payload.busy
        return { result: { success: true } }
      }
      if (message.type === 'executeAction') {
        state.actions.push(message.input)
        if (state.failOnce) { state.failOnce = false; throw new Error('simulated_uncertain_response') }
        state.data.items[0].status = message.input.decision
        state.data.items[0].allowedActions = []
        return { result: { success: true, data: { code: 'decision_saved' } } }
      }
      throw new Error('undeclared_request')
    },
  }
}
async function send(page, body) {
  await page.evaluate(({ instanceId, body }) => document.querySelector('#remote-view').contentWindow.postMessage({ channel:'xpertai.remote_component', protocolVersion:1, instanceId, ...body }, '*'), { instanceId:config.instanceId, body })
}
test('Profile built assets: opaque sandbox, roles, bounded panels, cancellation, exact retry and inactive polling', async () => {
  const browser = await chromium.launch({ headless: true })
  const preview = await startRemoteViewPreview(profileConfig(), { port: 0 })
  const page = await browser.newPage({ viewport: { width: 480, height: 440 } })
  page.setDefaultTimeout(10000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  try {
    await page.goto(preview.url)
    const frame = page.frameLocator('#remote-view')
    await expect(frame.locator('.profile-case')).toHaveCount(1)
    const storageBlocked = await frame.locator('body').evaluate(() => { try { localStorage.getItem('probe'); return false } catch { return true } })
    assert.equal(storageBlocked, true)
    await page.clock.install()
    const requests = preview.state.requests
    await send(page, { type: 'viewActive', active: false })
    await page.clock.runFor(50)
    await page.clock.fastForward(61000)
    assert.equal(preview.state.requests, requests)
    await send(page, { type:'viewActive', active:true })
    await page.clock.runFor(50)
    assert.equal(preview.state.requests, requests)
    await page.clock.fastForward(30100)
    await expect.poll(() => preview.state.requests).toBe(requests + 1)
    await frame.locator('.profile-case').click()
    await frame.getByRole('button', { name:'批准当前方案', exact: true }).click()
    await expect(frame.getByRole('alertdialog')).toBeVisible()
    assert.equal(preview.state.busy, true)
    await frame.getByRole('alertdialog').press('Escape')
    await expect(frame.getByRole('alertdialog')).toBeHidden()
    await expect.poll(() => preview.state.busy).toBe(false)
    assert.equal(preview.state.actions.length, 0)
    await frame.getByRole('button', { name:'批准当前方案', exact: true }).click()
    await frame.getByRole('textbox', { name:'审批理由（至少3个字）' }).fill('已核对图纸、规格与工厂编码映射。')
    preview.state.failOnce = true
    await frame.getByRole('button', { name:'确认提交' }).click()
    await expect(frame.getByRole('alertdialog').getByRole('alert')).toBeVisible()
    assert.equal(preview.state.busy, true)
    await frame.getByRole('button', { name:'确认提交' }).click()
    await expect(frame.getByRole('alertdialog')).toBeHidden()
    await expect.poll(() => preview.state.busy).toBe(false)
    assert.deepEqual(preview.state.actions[0], preview.state.actions[1])
    assert.equal(preview.state.actions.length, 2)
    for (const size of [{ width:480,height:440 }, { width:320,height:320 }]) {
      await page.setViewportSize(size)
      const box = await frame.locator('.material-profile').evaluate(el => ({ height:el.getBoundingClientRect().height, body:document.body.scrollHeight, width:document.body.scrollWidth, viewport:innerWidth, viewportHeight:innerHeight, scroll:getComputedStyle(document.querySelector('.profile-body')).overflowY }))
      assert.ok(box.body <= box.viewportHeight + 1, JSON.stringify(box))
      assert.ok(box.width <= box.viewport, JSON.stringify(box))
      assert.equal(box.scroll, 'auto')
    }
    await page.setViewportSize({ width:480,height:440 })
    if (screenshots) { await mkdir(screenshots, {recursive:true}); await page.screenshot({ path:resolve(screenshots,'profile-light.png') }) }
    await send(page, { type:'init', ...config.hostContext, locale:'en-US', manifest:{key:'material_identity_profile_governance_recent'}, active:true, theme:{mode:'dark',density:'compact',tokens:{colorBackground:'#09090b',colorForeground:'#fafafa',colorCard:'#18181b',colorMuted:'#27272a',colorBorder:'#3f3f46',colorInput:'#3f3f46',colorPrimary:'#fafafa',colorPrimaryForeground:'#18181b'}} })
    await expect(frame.locator('html')).toHaveClass('dark')
    await expect(frame.getByRole('button', { name:'Back to list' })).toBeVisible()
    if (screenshots) await page.screenshot({ path:resolve(screenshots,'profile-dark-en.png') })
    for (const role of ['coordinator','intake','engineering','standardization','quality','impact','governance','publisher']) {
      const fixture = profileConfig(role), rolePreview = await startRemoteViewPreview(fixture, {port:0})
      try { await page.goto(rolePreview.url); await expect(page.frameLocator('#remote-view').locator('.profile-case')).toHaveCount(1) }
      finally { await rolePreview.close() }
    }
    // The one synthetic uncertain response intentionally produces one HTTP 500 console entry.
    assert.deepEqual(errors.filter(e => !e.includes('500 (Internal Server Error)')), [])
    console.log(JSON.stringify({ roles:8, cancelWrites:0, retriesReuseExactInput:true, inactivePollingPaused:true, opaqueStorageBlocked:true }))
  } finally { await browser.close(); await preview.close() }
})
