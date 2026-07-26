import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import {
  startRemoteViewPreview
} from '../../../../../../../../xpert/tools/remote-view-preview/preview-host.mjs'
import previewConfig, { platformRoot } from './preview.config.mjs'

const componentRoot = dirname(fileURLToPath(import.meta.url))
const requireFromPlatform = createRequire(
  resolve(platformRoot, 'package.json')
)
const { chromium } = requireFromPlatform('playwright')

test(
  'creates, advances, synchronizes, and restores a Story Studio project',
  async (context) => {
    const preview = await startRemoteViewPreview(
      {
        ...previewConfig,
        state: structuredClone(previewConfig.state),
        logStartup: false,
        logErrors: false
      },
      { port: 0 }
    )
    context.after(() => preview.close())

    const browser = await chromium.launch({ headless: true })
    context.after(() => browser.close())
    const page = await browser.newPage({
      viewport: { width: 1440, height: 960 },
      deviceScaleFactor: 1,
      colorScheme: 'light',
      locale: 'zh-CN'
    })
    const pageErrors = []
    const consoleErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text())
      }
    })

    await page.goto(preview.url)
    const frame = page.frameLocator('#remote-view')
    await assertVisible(frame.getByRole('heading', { name: 'Story Studio' }))
    await assertVisible(
      frame.getByRole('heading', { name: '月港信使', exact: true })
    )
    await assertVisible(
      frame.getByRole('heading', {
        name: '月光蓝与琥珀色记忆颗粒',
        exact: true
      })
    )
    const lightPrimaryButton = await frame
      .getByRole('button', { name: '新建项目' })
      .evaluate((button) => {
        const buttonStyle = getComputedStyle(button)
        const bodyStyle = getComputedStyle(document.body)
        return {
          color: buttonStyle.color,
          backgroundColor: buttonStyle.backgroundColor,
          bodyColor: bodyStyle.color
        }
      })
    assert.notEqual(
      lightPrimaryButton.color,
      lightPrimaryButton.bodyColor,
      `Light primary button inherited body text color: ${JSON.stringify(lightPrimaryButton)}`
    )
    assert.notEqual(
      lightPrimaryButton.color,
      lightPrimaryButton.backgroundColor,
      `Light primary button has no text contrast: ${JSON.stringify(lightPrimaryButton)}`
    )
    const desktopLayout = await frame.locator('.ss-root').evaluate((root) => ({
      clientHeight: root.clientHeight,
      scrollHeight: root.scrollHeight,
      viewportHeight: window.innerHeight,
      bodyClientHeight: document.body.clientHeight,
      bodyScrollHeight: document.body.scrollHeight,
      projectsOverflowY: getComputedStyle(
        document.querySelector('.ss-project-list')
      ).overflowY,
      stageOverflowY: getComputedStyle(
        document.querySelector('.ss-stage-content')
      ).overflowY,
      inspectorOverflowY: getComputedStyle(
        document.querySelector('.ss-inspector')
      ).overflowY
    }))
    assert.equal(desktopLayout.clientHeight, desktopLayout.viewportHeight)
    assert.ok(
      desktopLayout.scrollHeight <= desktopLayout.clientHeight + 1,
      `Studio root scrolls: ${JSON.stringify(desktopLayout)}`
    )
    assert.ok(
      desktopLayout.bodyScrollHeight <= desktopLayout.bodyClientHeight + 1,
      `Workbench body scrolls: ${JSON.stringify(desktopLayout)}`
    )
    assert.equal(desktopLayout.projectsOverflowY, 'auto')
    assert.equal(desktopLayout.stageOverflowY, 'auto')
    assert.equal(desktopLayout.inspectorOverflowY, 'auto')

    await frame.getByRole('button', { name: '收起项目库' }).click()
    await assertVisible(frame.getByRole('button', { name: '展开项目库' }))
    assert.ok(
      (await frame.locator('.ss-projects').evaluate((panel) => panel.getBoundingClientRect().width)) <= 36.5
    )
    await frame.getByRole('button', { name: '展开项目库' }).click()
    await assertVisible(frame.getByRole('button', { name: '收起项目库' }))

    await frame.getByRole('button', { name: '收起检查器' }).click()
    await assertVisible(frame.getByRole('button', { name: '展开检查器' }))
    assert.ok(
      (await frame.locator('.ss-inspector').evaluate((panel) => panel.getBoundingClientRect().width)) <= 36.5
    )
    await frame.getByRole('button', { name: '展开检查器' }).click()
    await assertVisible(frame.getByRole('button', { name: '收起检查器' }))

    await frame.getByRole('button', { name: /素材/ }).click()
    await assertVisible(frame.getByRole('heading', { name: '潮汐旧闻' }))
    await frame.getByRole('button', { name: /故事计划/ }).click()
    await assertVisible(frame.getByText('被遗忘的人仍值得被送回家。'))
    await frame.getByRole('button', { name: /分集剧本/ }).click()
    await assertVisible(
      frame.locator('.ss-episode-list').getByRole('heading', {
        name: '最后一件包裹',
        exact: true
      })
    )
    await frame.getByRole('button', { name: /资产圣经/ }).click()
    await assertVisible(
      frame.locator('.ss-asset-grid').getByRole('heading', { name: '月港信使' })
    )
    await frame.getByRole('button', { name: /分镜/ }).click()
    await assertVisible(
      frame.locator('.ss-shot-grid').getByRole('heading', {
        name: '记忆包裹',
        exact: true
      })
    )
    await frame.getByRole('button', { name: /媒体生成/ }).click()
    await assertVisible(frame.getByText('Seedance 生成队列'))
    await frame.getByRole('button', { name: '渲染预演 MP4' }).click()
    await assertVisible(frame.getByText('正在渲染 0%', { exact: true }))
    assert.equal(
      preview.state.actions.at(-1)?.actionKey,
      'start_render'
    )
    await frame.getByRole('button', { name: /Cut 交接/ }).click()
    await assertVisible(
      frame.getByRole('heading', { name: '创建 Cut 项目', exact: true })
    )
    await frame
      .getByRole('button', { name: '准备并发送到 Cut' })
      .click()
    await assertVisible(frame.getByText('已交付 Cut', { exact: true }))
    assert.equal(
      preview.state.actions.at(-1)?.actionKey,
      'prepare_cut_handoff'
    )
    assert.equal(
      preview.state.assistantMessages.at(-1)?.state?.action,
      'accept_story_cut_handoff'
    )
    assert.equal(
      preview.state.handoffByProject['project-1']?.cutProjectId,
      '00000000-0000-4000-8000-000000000055'
    )

    assert.equal(
      await frame.getByRole('button', { name: /切换到.+主题/ }).count(),
      0,
      'Story Studio must not expose a local theme override.'
    )
    await emitHostTheme(page, 'dark')
    await assertTheme(frame, 'dark')
    await emitHostTheme(page, 'light')
    await assertTheme(frame, 'light')

    await frame.getByRole('button', { name: '下一页' }).click()
    await assertVisible(
      frame.getByRole('heading', { name: '示例故事 19', exact: true })
    )
    await frame.getByRole('button', { name: '上一页' }).click()
    await assertVisible(
      frame.getByRole('heading', { name: '月港信使', exact: true })
    )

    preview.state.failNextAction = true
    await frame.getByRole('button', { name: '新建项目' }).click()
    await frame.getByLabel('标题').fill('失败响应验证')
    await frame.getByRole('button', { name: '创建项目' }).click()
    await waitFor(() =>
      preview.state.notifications.some(
        (item) =>
          item.level === 'error' && item.message === '预览动作已拒绝'
      )
    )
    assert.equal(preview.state.projects.length, 22)

    await frame.getByLabel('标题').fill('玻璃海岸')
    await frame.getByLabel('描述').fill('一部审核优先的竖屏短剧。')
    await frame
      .getByLabel('故事前提')
      .fill('退潮后，一名修复师在玻璃海岸找回失踪者的声音。')
    await frame.getByLabel('目标时长（秒）').fill('120')
    await frame.getByLabel('标签，以逗号分隔').fill('奇幻,冒险')
    await frame.getByRole('button', { name: '创建项目' }).click()

    await assertVisible(
      frame.getByRole('heading', { name: '玻璃海岸', exact: true })
    )
    assert.equal(preview.state.projects.length, 23)
    const created = preview.state.projects.find(
      (item) => item.title === '玻璃海岸'
    )
    assert.ok(created)
    assert.equal(created.status, 'draft')
    assert.equal(created.revision, 1)

    await frame.getByRole('button', { name: '推进到规划' }).click()
    await assertVisible(
      frame.locator('.ss-detail-hero').getByText('规划', {
        exact: true
      })
    )
    assert.equal(created.status, 'planning')
    assert.equal(created.revision, 2)
    assert.equal(
      preview.state.actions.at(-1)?.previousRevision,
      1
    )

    await waitFor(
      () =>
        preview.state.assistantContext?.env?.storyProjectId === created.id &&
        preview.state.assistantContext?.env?.storyProjectRevision === '2'
    )

    await page.reload()
    await assertVisible(
      frame.getByRole('heading', { name: '玻璃海岸', exact: true })
    )
    await assertVisible(
      frame.locator('.ss-detail-hero').getByText('规划', {
        exact: true
      })
    )

    const requestCount = preview.state.requestDataCount
    await page.evaluate((projectId) => {
      window.XpertRemoteViewPreview.emitHostEvent({
        payload: {
          data: JSON.stringify({
            tool: 'story_update_project',
            output: { receipt: { projectId } }
          })
        }
      })
    }, created.id)
    await waitFor(
      () => preview.state.requestDataCount > requestCount
    )

    const screenshotPath =
      process.env.WORKBENCH_E2E_SCREENSHOT?.trim()
    if (screenshotPath) {
      await page.screenshot({
        path: resolve(componentRoot, screenshotPath),
        fullPage: true
      })
    }

    await page.setViewportSize({ width: 760, height: 720 })
    await assertVisible(frame.getByRole('button', { name: '新建项目' }))
    await assertVisible(frame.getByRole('button', { name: '展开项目库' }))
    await assertVisible(frame.getByRole('button', { name: '展开检查器' }))
    const overflow = await frame.locator('.ss-root').evaluate((root) => ({
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      scrollHeight: root.scrollHeight,
      clientHeight: root.clientHeight,
      bodyScrollHeight: document.body.scrollHeight,
      bodyClientHeight: document.body.clientHeight
    }))
    assert.ok(
      overflow.scrollWidth <= overflow.clientWidth + 1,
      `Workbench overflows at narrow width: ${JSON.stringify(overflow)}`
    )
    assert.ok(
      overflow.scrollHeight <= overflow.clientHeight + 1 &&
      overflow.bodyScrollHeight <= overflow.bodyClientHeight + 1,
      `Workbench overflows at narrow height: ${JSON.stringify(overflow)}`
    )

    assert.deepEqual(pageErrors, [])
    assert.deepEqual(consoleErrors, [])
  }
)

async function assertVisible(locator) {
  await locator.waitFor({ state: 'visible', timeout: 10_000 })
}

async function emitHostTheme(page, mode) {
  await page.evaluate((nextMode) => {
    const frame = document.getElementById('remote-view')
    frame.contentWindow.postMessage(
      {
        channel: 'xpertai.remote_component',
        protocolVersion: 1,
        instanceId: 'story-studio-preview',
        type: 'themeChanged',
        theme: { mode: nextMode }
      },
      window.location.origin
    )
  }, mode)
}

async function assertTheme(frame, mode) {
  await frame
    .locator(`html[data-story-theme="${mode}"]`)
    .waitFor({ state: 'attached', timeout: 10_000 })
}

async function waitFor(predicate) {
  const startedAt = Date.now()
  while (!predicate()) {
    if (Date.now() - startedAt > 10_000) {
      throw new Error('Timed out waiting for preview host state.')
    }
    await new Promise((resolvePromise) =>
      setTimeout(resolvePromise, 25)
    )
  }
}
