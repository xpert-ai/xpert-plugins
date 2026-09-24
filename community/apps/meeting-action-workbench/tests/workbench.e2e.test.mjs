import assert from 'node:assert/strict'
import { access, mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { chromium } from 'playwright-core'
import previewConfig from '../src/lib/remote-components/meeting-action-workbench/preview.config.mjs'
import { startRemoteViewPreview } from '../../../../tools/remote-view-preview/preview-host.mjs'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const screenshotDir = join(packageRoot, 'docs', 'assets')

test('generated Workbench bundle supports review, confirmation, reload, and Assistant handoff', async () => {
  await mkdir(screenshotDir, { recursive: true })
  const preview = await startRemoteViewPreview(previewConfig, { port: 0 })
  const browser = await chromium.launch({ executablePath: await findBrowser(), headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' })
  const pageErrors = []
  const consoleErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  try {
    await page.goto(preview.url, { waitUntil: 'networkidle' })
    const view = page.frameLocator('#remote-view')
    await view.getByRole('heading', { name: '会议决议与行动项' }).waitFor()
    await view.locator('[data-slot="card-title"]').filter({ hasText: '产品周会 · 9 月 16 日' }).waitFor()
    await view.getByText('新版工作台在周五前完成中文验收。', { exact: true }).waitFor()

    const frame = page.frames().find((item) => item.url().includes('/__xpert/component'))
    assert.ok(frame, 'Generated remote component iframe should be available.')
    const metrics = await frame.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      overflow: getComputedStyle(document.documentElement).overflow,
      primary: getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()
    }))
    assert.equal(metrics.scrollWidth, metrics.width)
    assert.equal(metrics.overflow, 'hidden')
    assert.ok(metrics.primary)

    const decisionCard = view.getByText('新版工作台在周五前完成中文验收。', { exact: true }).locator('xpath=ancestor::*[@data-slot="card"]')
    await decisionCard.getByRole('button', { name: '编辑' }).click()
    const decisionDialog = view.getByRole('dialog')
    const decisionText = '新版工作台必须在周五前完成中文验收。'
    await decisionDialog.getByRole('textbox').fill(decisionText)
    await decisionDialog.getByRole('button', { name: '保存' }).click()
    await view.getByText(decisionText, { exact: true }).waitFor()

    const actionRow = view.getByText('补齐空状态和失败重试', { exact: true }).locator('xpath=ancestor::div[contains(@class,"border-b")]')
    await actionRow.getByRole('button', { name: '编辑' }).click()
    const actionDialog = view.getByRole('dialog')
    await actionDialog.getByLabel('负责人').fill('张敏（产品）')
    const statusSelect = actionDialog.getByText('状态', { exact: true }).locator('xpath=following::button[@role="combobox"][1]')
    await statusSelect.click()
    await view.getByRole('option', { name: '进行中' }).click()
    await actionDialog.getByRole('button', { name: '保存' }).click()
    await view.getByText('张敏（产品）').waitFor()

    await view.getByRole('button', { name: '确认全部结果' }).click()
    const confirmDialog = view.getByRole('alertdialog')
    await confirmDialog.getByRole('button', { name: '确认全部结果' }).click()
    await view.getByText('该会议结果已由人工确认。').waitFor()
    assert.equal(await view.getByRole('button', { name: '编辑' }).count(), 0)

    await page.reload({ waitUntil: 'networkidle' })
    await view.getByText('该会议结果已由人工确认。').waitFor()
    const reloadedFrame = page.frames().find((item) => item.url().includes('/__xpert/component'))
    assert.ok(reloadedFrame, 'Reloaded remote component iframe should be available.')
    await page.screenshot({ path: join(screenshotDir, 'workbench-confirmed.png'), fullPage: true })

    await view.getByRole('tab', { name: '执行跟踪' }).click()
    await view.getByRole('heading', { name: '执行概览' }).waitFor()
    await view.getByRole('heading', { name: '执行风险雷达' }).waitFor()
    await view.getByText('本地部署说明缺少明确验收标准', { exact: true }).waitFor()
    await view.getByRole('heading', { name: '下次会议跟进简报' }).waitFor()

    const executionStatus = view.getByLabel('更新状态 · 补齐空状态和失败重试')
    await executionStatus.click()
    await view.getByRole('option', { name: '已完成' }).click()
    await executionStatus.filter({ hasText: '已完成' }).waitFor()

    await view.getByRole('button', { name: '接受' }).click()
    await view.getByText('已接受', { exact: true }).waitFor()

    await view.getByRole('button', { name: 'Agent 执行巡检' }).click()
    const stateUrl = new URL('/__xpert/remote-view-preview/state', preview.url).href
    await page.waitForFunction(async (url) => {
      const response = await fetch(url)
      const snapshot = await response.json()
      return snapshot.state.commands.at(-1)?.payload?.text?.includes('meeting_get_execution_context')
    }, stateUrl)
    const patrolState = await (await page.request.get(stateUrl)).json()
    assert.match(patrolState.state.commands.at(-1).payload.text, /meeting_finalize_execution_review/)
    await page.screenshot({ path: join(screenshotDir, 'workbench-execution.png'), fullPage: true })

    await view.getByRole('button', { name: '新建提取' }).click()
    const newDialog = view.getByRole('dialog')
    const longMeetingText = Array.from({ length: 220 }, (_, index) =>
      `第 ${index + 1} 项记录：会议决定按计划推进区域试点，负责人李华需要在 2026-09-20 前更新验收清单并反馈风险。`
    ).join('\n')
    await newDialog.getByLabel('导入会议记录文件').setInputFiles({
      name: '客户需求评审会.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(longMeetingText, 'utf8')
    })
    await newDialog.getByText('已导入：客户需求评审会.txt', { exact: true }).waitFor()
    assert.equal(await newDialog.getByLabel('会议标题').inputValue(), '客户需求评审会')
    const sourceEditor = newDialog.getByLabel('会议内容')
    assert.equal(await sourceEditor.inputValue(), longMeetingText)
    const sourceMetrics = await sourceEditor.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      overflowY: getComputedStyle(element).overflowY
    }))
    assert.ok(sourceMetrics.scrollHeight > sourceMetrics.clientHeight, 'Long meeting text should scroll inside its editor.')
    assert.equal(sourceMetrics.overflowY, 'auto')
    const submitButton = newDialog.getByRole('button', { name: '发送给 Assistant' })
    const submitBounds = await submitButton.boundingBox()
    const dialogFrame = page.frames().find((item) => item.url().includes('/__xpert/component'))
    assert.ok(dialogFrame && submitBounds, 'The long-text submit action should remain visible in the iframe.')
    const frameHeight = await dialogFrame.evaluate(() => document.documentElement.clientHeight)
    assert.ok(submitBounds.y + submitBounds.height <= frameHeight, 'The submit action should stay inside the viewport.')
    await page.screenshot({ path: join(screenshotDir, 'workbench-long-file-import.png'), fullPage: true })
    await submitButton.click()
    const state = await (await page.request.get(new URL('/__xpert/remote-view-preview/state', preview.url).href)).json()
    assert.equal(state.state.commands.at(-1).commandKey, 'assistant.chat.send_message')
    assert.match(state.state.commands.at(-1).payload.text, /客户需求评审会/)
    assert.match(state.state.commands.at(-1).payload.text, /第 220 项记录/)

    await page.setViewportSize({ width: 1024, height: 800 })
    const narrow = await reloadedFrame.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth
    }))
    assert.equal(narrow.scrollWidth, narrow.width)
    await page.screenshot({ path: join(screenshotDir, 'workbench-compact.png'), fullPage: true })
    assert.deepEqual(pageErrors, [])
    assert.deepEqual(consoleErrors, [])
  } finally {
    await browser.close()
    await preview.close()
  }
})

test('failed state exposes a comprehensible AI retry path', async () => {
  const failedConfig = {
    ...previewConfig,
    instanceId: 'meeting-action-workbench-failed-preview',
    state: {
      meeting: {
        ...structuredClone(previewConfig.state.meeting),
        status: 'failed',
        revision: 7,
        errorCode: 'MODEL_CALL_FAILED',
        errorMessage: '模型暂时不可用，请稍后重试。',
        decisions: [],
        actionItems: [],
        decisionCount: 0,
        actionItemCount: 0
      },
      commands: []
    }
  }
  const preview = await startRemoteViewPreview(failedConfig, { port: 0 })
  const browser = await chromium.launch({ executablePath: await findBrowser(), headless: true })
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 }, reducedMotion: 'reduce' })
  try {
    await page.goto(preview.url, { waitUntil: 'networkidle' })
    const view = page.frameLocator('#remote-view')
    await view.getByText('MODEL_CALL_FAILED').waitFor()
    await view.getByText('模型暂时不可用，请稍后重试。').waitFor()
    await view.getByRole('button', { name: 'AI 重新提取' }).click()
    const stateUrl = new URL('/__xpert/remote-view-preview/state', preview.url).href
    await page.waitForFunction(async (url) => {
      const response = await fetch(url)
      const snapshot = await response.json()
      return snapshot.state.commands.length === 1
    }, stateUrl)
    const state = await (await page.request.get(stateUrl)).json()
    assert.equal(state.state.commands.length, 1)
    assert.match(state.state.commands[0].payload.text, new RegExp(failedConfig.state.meeting.id))
    assert.match(state.state.commands[0].payload.text, /安全重试/)
  } finally {
    await browser.close()
    await preview.close()
  }
})

async function findBrowser() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  ].filter(Boolean)
  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {
      // Continue to the next deterministic browser location.
    }
  }
  throw new Error('No local Chromium-compatible browser is available.')
}
