import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { mkdir } from 'node:fs/promises'
import config from '../src/lib/remote-components/governance-workbench/preview.config.mjs'
const { startRemoteViewPreview } = await import(resolve(config.workspaceRoot, 'tools/remote-view-preview/preview-host.mjs'))
const requireFromHost = createRequire(resolve(config.workspaceRoot, 'package.json'))
const { chromium } = requireFromHost('playwright')
const { expect } = requireFromHost('@playwright/test')

test('business workspace opens native Project pipelines, preserving history only for the selected case', async () => {
  const focus = { pipelineInstanceId: '20000000-0000-4000-8000-000000000102', pipelineRoundId: '30000000-0000-4000-8000-000000000102', pipelineNodeId: '40000000-0000-4000-8000-000000000102' }
  const preview = await startRemoteViewPreview({ ...config,
    hostContext: { ...config.hostContext, initialQuery: { selectionId: config.state.selectionId, parameters: { surface: 'workspace', ...focus } } },
    state: { ...structuredClone(config.state), surface: 'workspace' }
  }, { port: 0 })
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
    await page.goto(preview.url)
    const frame = page.frameLocator('#remote-view')
    await expect(frame.getByRole('heading', { name: '证据与治理审批', exact: true })).toBeVisible()
    assert.equal(await frame.getByRole('region', { name: '案例协同流水线' }).count(), 0)
    await frame.getByRole('button', { name: '项目流水线', exact: true }).click()
    await expect.poll(() => preview.state.navigation.at(-1)?.viewKey).toBe('platform.project-tasks__timeline')
    const navigation = preview.state.navigation.at(-1)
    assert.equal(navigation.target, 'assistant.project')
    assert.equal(navigation.parameters.initialTab, 'pipeline')
    for (const [key, value] of Object.entries(focus)) assert.equal(navigation.parameters[key], value)
    await frame.getByRole('combobox', { name: '选择治理案例' }).click()
    await frame.getByRole('option', { name: /MIG-RD-000103/ }).click()
    await expect.poll(() => preview.state.selectionId).toBe('00000000-0000-4000-8000-000000000103')
    await frame.getByRole('button', { name: '项目流水线', exact: true }).click()
    await expect.poll(() => preview.state.navigation.at(-1)?.projectId).toBe('10000000-0000-4000-8000-000000000103')
    assert.equal(Object.hasOwn(preview.state.navigation.at(-1).parameters, 'pipelineRoundId'), false)
    await frame.getByRole('button', { name: '启动 / 打开项目流水线', exact: true }).click()
    await expect.poll(() => preview.state.navigation.at(-1)?.parameters?.pipelineInstanceId).toBe('20000000-0000-4000-8000-000000000103')
    assert.equal(preview.state.actions.at(-1), 'start_pipeline')
    await frame.getByRole('button', { name: '返回管理监控', exact: true }).click()
    await expect(frame.getByRole('heading', { name: '治理监控', exact: true })).toBeVisible()
    assert.equal(preview.state.navigation.at(-1).viewKey, 'material_identity_operations_dashboard')
    if (process.env.WORKBENCH_E2E_SCREENSHOT_DIR) {
      await mkdir(process.env.WORKBENCH_E2E_SCREENSHOT_DIR, { recursive: true })
      await page.screenshot({ path: resolve(process.env.WORKBENCH_E2E_SCREENSHOT_DIR, 'material-dashboard.png') })
    }
    assert.deepEqual(errors, [])
  } finally { await browser.close(); await preview.close() }
})
