import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import test from 'node:test'

import previewConfig, { platformRoot } from './preview.config.mjs'

const { startRemoteViewPreview } = await import(
  resolve(platformRoot, 'tools/remote-view-preview/preview-host.mjs')
)
const requireFromPlatform = createRequire(resolve(platformRoot, 'package.json'))
const { chromium } = requireFromPlatform('playwright')

test('operates the server-projected swimlane pipeline through built Remote View assets', async (context) => {
  const preview = await startRemoteViewPreview(
    { ...previewConfig, state: structuredClone(previewConfig.state), logStartup: false, logErrors: false },
    { port: 0 }
  )
  context.after(() => preview.close())
  const browser = await chromium.launch({ headless: true })
  context.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, locale: 'zh-CN', colorScheme: 'light' })
  const pageErrors = []
  const consoleErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })

  await page.goto(preview.url)
  const frame = page.frameLocator('#remote-view')
  await assertVisible(frame.getByRole('heading', { name: '多智能体异常恢复泳道流水线' }))
  await assertVisible(frame.getByRole('heading', { name: '暂无活动 Factory Case' }))
  await frame.getByRole('button', { name: '载入 M-07 异常' }).last().click()
  assert.match(await frame.locator('.foc-case-trigger').textContent(), /FAC-260831-M07/)
  assert.equal(await frame.locator('.foc-lane-label').count(), 8)
  assert.equal(await frame.locator('.foc-stage-head').count(), 7)
  assert.equal(await frame.locator('.foc-task').count(), 10)
  assert.ok(await frame.locator('.foc-router').count() >= 2)
  assert.equal(await frame.locator('.foc-context-strip').count(), 0)
  assert.equal(await frame.locator('.foc-casebar').count(), 1)
  await frame.getByRole('button', { name: 'Factory Case 上下文' }).click()
  await assertVisible(frame.getByText('磨削中心 M-07', { exact: true }))
  await assertVisible(frame.getByText('Flow', { exact: true }))
  const caseHoverBox = await frame.locator('.foc-case-hover').boundingBox()
  assert.ok(caseHoverBox)
  assert.ok(caseHoverBox.x >= 0 && caseHoverBox.y >= 0)
  assert.ok(caseHoverBox.x < 1600 && caseHoverBox.y < 1100)
  assert.equal(await frame.locator('.foc-avatar-glyph').first().textContent(), '🚨')
  await assertRoundedSquareAvatar(frame.locator('.foc-assistant-avatar').first())
  await frame.locator('.foc-lane-label button').first().click()
  assert.equal(await frame.locator('[data-lane-row="event-intake"]').getAttribute('data-selected'), 'true')
  assert.match(await frame.locator('[data-lane-row="event-intake"]').getAttribute('class'), /is-selected/)
  await assertVisible(frame.getByText('确认异常真实性', { exact: true }))

  await frame.getByRole('button', { name: '推进下一任务' }).click()
  await waitFor(() => preview.state.assistantTasks.length === 1)
  assert.equal(preview.state.actions.at(-1).actionKey, 'dispatch_assistant_task')
  assert.equal(preview.state.assistantTasks[0].nodeKey, 'triage-event')
  assert.equal(preview.state.assistantTasks[0].baseRevision, 1)
  assert.ok(preview.state.assistantTasks[0].operationId)
  await frame.getByRole('button', { name: '刷新' }).click()
  await assertVisible(frame.getByText('等待审批', { exact: true }))

  await frame.getByRole('button', { name: '推进下一任务' }).click()
  await assertVisible(frame.getByRole('heading', { name: '生产运营负责人审批' }))
  await frame.getByRole('button', { name: '批准方案 B' }).click()
  await assertVisible(frame.getByRole('heading', { name: '授权执行恢复方案 B？' }))
  await frame.getByRole('button', { name: '批准当前修订' }).click()
  await waitFor(() => preview.state.actions.at(-1)?.actionKey === 'approve_recovery_plan')
  assert.equal(preview.state.actions.at(-1).actionKey, 'approve_recovery_plan')
  await frame.getByRole('button', { name: 'Close' }).click()
  await assertVisible(frame.getByText('已批准', { exact: true }))

  await frame.getByRole('button', { name: '推进下一任务' }).click()
  await assertVisible(frame.getByRole('heading', { name: '执行已批准恢复方案' }))
  await frame.getByRole('button', { name: '执行已批准方案' }).click()
  await waitFor(() => preview.state.actions.at(-1)?.actionKey === 'execute_recovery_plan')
  assert.equal(preview.state.actions.at(-1).actionKey, 'execute_recovery_plan')
  await frame.getByRole('button', { name: 'Close' }).click()
  await frame.getByRole('heading', { name: '执行已批准恢复方案' }).waitFor({ state: 'hidden' })
  await assertVisible(frame.getByText('验证中', { exact: true }))

  await frame.getByText('验证设备、质量与生产恢复', { exact: true }).click()
  await waitFor(() => preview.state.navigations.some((item) => item.target === 'assistant.project'))
  const viewNavigation = preview.state.navigations.findLast((item) => item.target === 'workbench.view')
  const projectNavigation = preview.state.navigations.findLast((item) => item.target === 'assistant.project')
  assert.equal(viewNavigation.viewKey, 'factory-case-workspace')
  assert.equal(viewNavigation.selectionId, '00000000-0000-4000-8000-000000000070')
  assert.equal(viewNavigation.parameters.nodeKey, 'verify-recovery')
  assert.equal(projectNavigation.projectId, '10000000-0000-4000-8000-000000000070')
  assert.ok(preview.state.navigations.indexOf(viewNavigation) < preview.state.navigations.indexOf(projectNavigation))

  preview.state.navigation = null
  await frame.locator('.foc-execution-dot').first().click()
  await waitFor(() => Boolean(preview.state.navigation))
  assert.equal(preview.state.navigation.target, 'assistant.conversation')
  assert.ok(preview.state.navigation.executionId)

  assert.equal(pageErrors.length, 0, pageErrors.join('\n'))
  assert.equal(consoleErrors.length, 0, consoleErrors.join('\n'))
})

async function assertVisible(locator) {
  await locator.waitFor({ state: 'visible', timeout: 15_000 })
  assert.equal(await locator.isVisible(), true)
}

async function assertRoundedSquareAvatar(locator) {
  const shape = await locator.evaluate((element) => {
    const style = getComputedStyle(element)
    return { width: style.width, height: style.height, borderRadius: style.borderRadius }
  })
  assert.equal(shape.width, shape.height)
  assert.notEqual(shape.borderRadius, '50%')
  assert.ok(Number.parseFloat(shape.borderRadius) > 0)
}

async function waitFor(predicate, timeoutMs = 10_000) {
  const started = Date.now()
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for preview state.')
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25))
  }
}
