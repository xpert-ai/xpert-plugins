import assert from 'node:assert/strict'
import { access } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { chromium } from 'playwright-core'
import previewConfig from '../src/lib/remote-components/review-workbench/preview.config.mjs'
import { startRemoteViewPreview } from '../../../../tools/remote-view-preview/preview-host.mjs'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultScreenshot = '/tmp/img2threejs-workbench-studio.png'
const defaultNarrowScreenshot = '/tmp/img2threejs-workbench-studio-narrow.png'

test('real Workbench bundle hands semantic image analysis to Agent chat and persists uploads', async () => {
  const executablePath = await findChrome()
  const preview = await startRemoteViewPreview(previewConfig, { port: 0 })
  const browser = await chromium.launch({ executablePath, headless: true })
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1024 },
    colorScheme: 'dark',
    reducedMotion: 'reduce'
  })
  const pageErrors = []
  const consoleErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  await page.route('**/__mock/*.svg', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    const comparison = name === 'comparison.svg'
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: comparison ? comparisonSvg() : referenceSvg(name ?? 'reference')
    })
  })

  try {
    await page.goto(preview.url, { waitUntil: 'networkidle' })
    const workbench = page.frameLocator('#remote-view')
    await workbench.getByRole('heading', { name: 'Clockwork Fox' }).waitFor()
    await workbench.getByText('Xpert Image-to-Three.js').waitFor()

    const workbenchFrame = page.frames().find((frame) => frame.url().includes('/__xpert/component'))
    assert.ok(workbenchFrame, 'The generated Workbench iframe should be available.')
    await assertCompactViewport(workbenchFrame)

    const projectPanel = workbench.locator('.project-rail')
    await workbench.getByRole('button', { name: 'Collapse project panel' }).click()
    assert.equal(await projectPanel.getAttribute('class'), 'project-rail is-collapsed')
    assert.ok((await projectPanel.boundingBox())?.width <= 50)
    await workbench.getByRole('button', { name: 'Expand project panel' }).click()
    assert.ok((await projectPanel.boundingBox())?.width >= 150)

    const inspectorPanel = workbench.locator('.production-inspector')
    await workbench.getByRole('button', { name: 'Collapse inspector panel' }).click()
    assert.equal(await inspectorPanel.getAttribute('class'), 'production-inspector is-collapsed')
    assert.ok((await inspectorPanel.boundingBox())?.width <= 50)
    await workbench.getByRole('button', { name: 'Expand inspector panel' }).click()
    assert.ok((await inspectorPanel.boundingBox())?.width >= 240)

    const stagePanel = workbench.locator('.stage-monitor')
    await workbench.getByRole('button', { name: 'Collapse generation progress' }).click()
    assert.equal(await stagePanel.locator('li').count(), 0)
    await workbench.getByRole('button', { name: 'Expand generation progress' }).click()
    assert.equal(await stagePanel.locator('li').count(), 8)

    const setupPanel = workbench.locator('details.collapsible-section').first()
    assert.equal(await setupPanel.getAttribute('open'), '')
    await setupPanel.locator('summary').click()
    assert.equal(await setupPanel.getAttribute('open'), null)
    await setupPanel.locator('summary').click()
    assert.equal(await setupPanel.getAttribute('open'), '')

    const reviewPanel = workbench.locator('details.review-drawer')
    assert.equal(await reviewPanel.getAttribute('open'), null)
    await reviewPanel.locator('summary').click()
    assert.equal(await reviewPanel.getAttribute('open'), '')
    await reviewPanel.getByText('Reference fidelity gates').waitFor()
    await reviewPanel.getByText('Silhouette IoU').waitFor()
    await reviewPanel.getByText('86%').waitFor()
    assert.equal(await reviewPanel.getByRole('button', { name: 'Approve & continue' }).isDisabled(), false)
    await reviewPanel.locator('summary').click()
    assert.equal(await reviewPanel.getAttribute('open'), null)

    await workbench.getByRole('button', { name: /New project/ }).click()

    const projectName = 'Studio Rocket E2E'
    const projectNameInput = workbench.getByRole('textbox', { name: 'Project name' })
    await projectNameInput.click()
    await projectNameInput.pressSequentially(projectName)
    assert.equal(await projectNameInput.inputValue(), projectName)
    const createButton = workbench.locator('.inspector-primary .primary-action')
    assert.equal(await createButton.isDisabled(), false, await createButton.evaluate((button) => button.outerHTML))
    await createButton.click()
    await workbench.getByRole('heading', { name: projectName }).waitFor()
    await workbench.getByText('No reference images yet. Add at least one image to continue.').waitFor()
    await workbench.getByText(
      'No default model is shown. Upload references, then ask Agent chat to analyze them and build semantic procedural 3D.'
    ).waitFor()
    assert.equal(await workbench.getByTestId('threejs-viewer').count(), 0)

    await workbench.getByRole('combobox', { name: 'Declared camera view' }).selectOption('front')
    await workbench.getByLabel('Choose reference images').setInputFiles({
      name: 'rocket-front.png',
      mimeType: 'image/png',
      buffer: onePixelPng()
    })
    await workbench.getByText('1 reference image(s) uploaded.').waitFor()
    assert.equal(await workbench.locator('.reference-thumb img').count(), 1)

    await workbench.getByRole('button', { name: 'Send to Agent and generate' }).click()
    await workbench.getByText(
      'Sent to Agent. Semantic analysis and Sculpt Spec tool calls are running in this conversation.'
    ).waitFor()
    await workbench.getByTestId('threejs-viewer').waitFor()
    assert.equal(await workbench.locator('.stage-monitor li.passed').count(), 8)

    const handedOffState = await (await page.request.get(
      new URL('/__xpert/remote-view-preview/state', preview.url).href
    )).json()
    assert.equal(handedOffState.state.selected.project.modelingMode, 'semantic-3d')
    assert.ok(handedOffState.state.selected.viewerScene)
    assert.ok(handedOffState.state.selected.project.runId)
    assert.equal(handedOffState.state.clientCommands.length, 1)
    assert.equal(handedOffState.state.clientCommands[0].commandKey, 'assistant.chat.send_message')
    assert.match(
      handedOffState.state.clientCommands[0].payload.text,
      new RegExp(handedOffState.state.selected.project.projectId)
    )
    assert.match(handedOffState.state.clientCommands[0].payload.text, /img2threejs-semantic-modeling/)
    assert.ok(handedOffState.state.clientCommands[0].payload.text.length < 900)
    assert.doesNotMatch(handedOffState.state.clientCommands[0].payload.text, /严格顺序/)
    assert.equal(
      handedOffState.state.selected.viewerScene.components.some(
        (component) => component.geometry?.type === 'heightfield'
      ),
      false
    )

    await page.reload({ waitUntil: 'networkidle' })
    await workbench.getByRole('heading', { name: projectName }).waitFor()
    const reloadedFrame = page.frames().find((frame) => frame.url().includes('/__xpert/component'))
    assert.ok(reloadedFrame, 'The reloaded Workbench iframe should be available.')
    await assertCompactViewport(reloadedFrame)
    const restoredReference = workbench.locator('.reference-thumb img')
    await restoredReference.waitFor()
    assert.ok(await restoredReference.evaluate((image) => image.naturalWidth > 0))

    const screenshotPath = process.env.WORKBENCH_E2E_SCREENSHOT || defaultScreenshot
    await page.screenshot({ path: screenshotPath, fullPage: true })

    await page.setViewportSize({ width: 662, height: 922 })
    await reloadedFrame.waitForFunction(() =>
      document.querySelector('.studio-workspace')?.classList.contains('narrow-layout')
    )
    await assertNarrowViewport(reloadedFrame, workbench)
    const narrowScreenshotPath = process.env.WORKBENCH_NARROW_E2E_SCREENSHOT || defaultNarrowScreenshot
    await page.screenshot({ path: narrowScreenshotPath, fullPage: true })

    const persisted = await (await page.request.get(
      new URL('/__xpert/remote-view-preview/state', preview.url).href
    )).json()
    const actionKeys = persisted.state.actions.map((item) => item.actionKey)
    assert.equal(actionKeys[0], 'create_project')
    assert.ok(actionKeys.includes('upload_reference'))
    assert.ok(actionKeys.includes('start_generation'))
    assert.equal(actionKeys.includes('advance_generation'), false)
    assert.equal(persisted.state.selected.project.status, 'review_required')
    assert.equal(persisted.state.selected.project.completedStages.length, 8)
    assert.deepEqual(pageErrors, [])
    assert.deepEqual(consoleErrors, [])
  } finally {
    await browser.close()
    await preview.close()
  }
})

async function assertNarrowViewport(frame, workbench) {
  const projectPanel = workbench.locator('.project-rail')
  const inspectorPanel = workbench.locator('.production-inspector')
  const canvas = workbench.locator('.canvas-stage')
  assert.equal(await projectPanel.getAttribute('class'), 'project-rail is-collapsed')
  assert.equal(await inspectorPanel.getAttribute('class'), 'production-inspector is-collapsed')

  const initialCanvas = await canvas.boundingBox()
  assert.ok(initialCanvas?.width >= 540, JSON.stringify(initialCanvas))
  assert.ok((await projectPanel.boundingBox())?.width <= 50)
  assert.ok((await inspectorPanel.boundingBox())?.width <= 50)

  await workbench.getByRole('button', { name: 'Expand project panel' }).click()
  const projectOverlay = await projectPanel.boundingBox()
  assert.equal(await projectPanel.evaluate((element) => getComputedStyle(element).position), 'absolute')
  assert.ok(projectOverlay?.width >= 240, JSON.stringify(projectOverlay))
  assert.ok(Math.abs((await canvas.boundingBox()).width - initialCanvas.width) <= 1)
  assert.equal(
    await workbench.locator('.project-list').evaluate((element) => getComputedStyle(element).overflowY),
    'auto'
  )
  await workbench.getByRole('button', { name: 'Collapse project panel' }).click()

  await workbench.getByRole('button', { name: 'Expand inspector panel' }).click()
  const inspectorOverlay = await inspectorPanel.boundingBox()
  assert.equal(await inspectorPanel.evaluate((element) => getComputedStyle(element).position), 'absolute')
  assert.ok(inspectorOverlay?.width >= 240, JSON.stringify(inspectorOverlay))
  assert.ok(Math.abs((await canvas.boundingBox()).width - initialCanvas.width) <= 1)
  assert.equal(
    await workbench.locator('.inspector-scroll').evaluate((element) => getComputedStyle(element).overflowY),
    'auto'
  )
  await workbench.getByRole('button', { name: 'Collapse inspector panel' }).click()

  await assertCompactViewport(frame)
}

async function assertCompactViewport(frame) {
  const metrics = await frame.evaluate(() => {
    const root = document.documentElement
    const body = document.body
    const projectList = document.querySelector('.project-list')
    const inspectorScroll = document.querySelector('.inspector-scroll')
    return {
      rootClientHeight: root.clientHeight,
      rootScrollHeight: root.scrollHeight,
      bodyClientHeight: body.clientHeight,
      bodyScrollHeight: body.scrollHeight,
      rootOverflow: getComputedStyle(root).overflow,
      bodyOverflow: getComputedStyle(body).overflow,
      projectListOverflowY: projectList ? getComputedStyle(projectList).overflowY : null,
      inspectorOverflowY: inspectorScroll ? getComputedStyle(inspectorScroll).overflowY : null
    }
  })
  assert.equal(metrics.rootOverflow, 'hidden')
  assert.equal(metrics.bodyOverflow, 'hidden')
  assert.ok(metrics.rootScrollHeight <= metrics.rootClientHeight + 1, JSON.stringify(metrics))
  assert.ok(metrics.bodyScrollHeight <= metrics.bodyClientHeight + 1, JSON.stringify(metrics))
  if (metrics.projectListOverflowY !== null) assert.equal(metrics.projectListOverflowY, 'auto')
  if (metrics.inspectorOverflowY !== null) assert.equal(metrics.inspectorOverflowY, 'auto')
}

async function findChrome() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium'
  ].filter(Boolean)
  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {
      // Continue to the next deterministic browser location.
    }
  }
  throw new Error('No local Chromium executable is available for the Workbench mock E2E test.')
}

function onePixelPng() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAHUlEQVQ4jWOosXr7nxLMMGrA/9EweDsaBlbDIgwARjiiHypKmFgAAAAASUVORK5CYII=',
    'base64'
  )
}

function referenceSvg(label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#111827"/><path d="M320 68 438 206 390 408H250l-48-202Z" fill="#7c3aed"/><circle cx="320" cy="222" r="48" fill="#f4f4f5"/><text x="320" y="450" text-anchor="middle" fill="#c4b5fd" font-family="system-ui" font-size="24">${label}</text></svg>`
}

function comparisonSvg() {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="920" height="520"><rect width="920" height="520" fill="#090e17"/><text x="40" y="52" fill="#f4f4f5" font-family="system-ui" font-size="24">Reference versus browser render</text><rect x="40" y="82" width="390" height="390" rx="12" fill="#1f2937"/><rect x="490" y="82" width="390" height="390" rx="12" fill="#111827"/><circle cx="685" cy="270" r="120" fill="#7c3aed"/></svg>'
}

assert.ok(packageRoot.endsWith('img2threejs'))
