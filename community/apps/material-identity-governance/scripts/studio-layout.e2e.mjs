import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { mkdir } from 'node:fs/promises'
import config from '../src/lib/remote-components/governance-workbench/preview.config.mjs'
const { startRemoteViewPreview } = await import(
  resolve(config.workspaceRoot, 'tools/remote-view-preview/preview-host.mjs')
)

const requireFromHost = createRequire(
  resolve(config.workspaceRoot, 'package.json'),
)
const { chromium } = requireFromHost('playwright')
const { expect } = requireFromHost('@playwright/test')
const screenshotDir = process.env.WORKBENCH_E2E_SCREENSHOT_DIR

test('Studio keeps the canvas bounded while selection, disclosure and execution navigation remain usable', async () => {
  const preview = await startRemoteViewPreview(
    { ...config, state: { ...config.state, surface: 'pipeline' } },
    { port: 0 },
  )
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({
      viewport: { width: 1600, height: 900 },
    })
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })
    const open = async () => {
      await page.goto(preview.url)
      await page
        .frameLocator('#remote-view')
        .getByRole('region', { name: '案例协同流水线' })
        .waitFor()
    }
    await open()
    const frame = page.frameLocator('#remote-view')
    const canvas = frame.getByRole('region', { name: '案例协同流水线' })
    const measurements = []
    for (const size of [
      { width: 1600, height: 900 },
      { width: 1280, height: 720 },
      { width: 800, height: 600 },
      { width: 540, height: 500 },
    ]) {
      await page.setViewportSize(size)
      await expect
        .poll(() =>
          canvas.evaluate(
            (el) => el.ownerDocument.documentElement.clientHeight,
          ),
        )
        .toBe(size.height)
      const layout = await canvas.evaluate((el) => {
        const doc = el.ownerDocument,
          rect = el.getBoundingClientRect()
        return {
          root: doc.documentElement.clientHeight,
          body: doc.body.scrollHeight,
          bodyWidth: doc.body.scrollWidth,
          width: doc.documentElement.clientWidth,
          top: rect.top,
          bottom: rect.bottom,
          height: rect.height,
          overflow: getComputedStyle(el).overflowY,
        }
      })
      assert.ok(layout.body <= layout.root + 1, JSON.stringify(layout))
      assert.ok(layout.bodyWidth <= layout.width + 1, JSON.stringify(layout))
      assert.ok(
        layout.bottom <= layout.root && layout.bottom >= layout.root - 10,
        JSON.stringify(layout),
      )
      assert.ok(layout.height > size.height * 0.55, JSON.stringify(layout))
      assert.equal(layout.overflow, 'auto')
      assert.ok(
        await frame
          .getByRole('button', { name: '协调者推进下一步', exact: true })
          .isVisible(),
      )
      measurements.push({
        viewportWidth: size.width,
        viewportHeight: size.height,
        ...layout,
      })
    }
    await page.setViewportSize({ width: 1280, height: 720 })
    const info = frame.getByRole('button', { name: '案例信息', exact: true })
    await info.focus()
    await expect(frame.getByText('流程版本', { exact: true })).toBeVisible()
    await expect(frame.locator('.context-disclosure')).toBeInViewport({ratio:1})
    await info.press('Escape')
    await expect(frame.getByText('流程版本', { exact: true })).toBeHidden()
    await info.click()
    await expect(frame.getByText('流程版本', { exact: true })).toBeVisible()
    await expect(frame.locator('.context-disclosure')).toBeInViewport({ratio:1})
    await info.press('Escape')
    await frame
      .getByRole('button', { name: '画布操作说明', exact: true })
      .click()
    await expect(
      frame.getByText('拖动画布空白处平移 · 点击助理聚焦泳道'),
    ).toBeVisible()
    await frame
      .getByRole('button', { name: '画布操作说明', exact: true })
      .press('Escape')
    // Approval requirements stay in the glance layer; disclosure cannot hide them.
    await expect(frame.locator('.blocker-banner')).toBeVisible()
    assert.equal(
      await frame
        .getByRole('button', { name: '协调者推进下一步', exact: true })
        .isEnabled(),
      false,
    )
    await frame.getByRole('combobox', { name: '选择治理案例' }).click()
    await frame.getByRole('option', { name: /MIG-RD-000103/ }).click()
    await expect
      .poll(() => preview.state.selectionId)
      .toBe('00000000-0000-4000-8000-000000000103')
    await frame
      .getByRole('button', { name: '协调者推进下一步', exact: true })
      .click()
    await expect.poll(() => preview.state.records.length).toBe(1)
    const record = preview.state.records[0]
    await frame
      .getByTestId(`execution-${record.nodeKey}-${record.id}`)
      .last()
      .click()
    await expect
      .poll(() => preview.state.navigation.at(-1)?.executionId)
      .toBe(record.executionId)
    assert.equal(
      preview.state.navigation.at(-1).selectionId,
      preview.state.selectionId,
    )
    await frame.locator('.assistant-select').first().click()
    await expect(frame.locator('.assistant-select').first()).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await frame.getByRole('button', { name: '缩小', exact: true }).click()
    await expect(
      frame.getByRole('button', { name: '75%', exact: true }),
    ).toBeVisible()
    const box = await canvas.boundingBox()
    await page.mouse.move(box.x + box.width - 20, box.y + 120)
    await page.mouse.wheel(0, 500)
    await expect
      .poll(() => canvas.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0)
    assert.equal(await frame.locator('body').evaluate((el) => el.scrollTop), 0)
    await canvas.press('Home')
    await open()
    await expect(frame.getByRole('combobox')).toContainText('MIG-RD-000103')
    await expect(
      frame.getByTestId(`execution-${record.nodeKey}-${record.id}`).last(),
    ).toBeVisible()
    if (screenshotDir) {
      await mkdir(screenshotDir, { recursive: true })
      await page.screenshot({
        path: resolve(screenshotDir, 'studio-preview-light.png'),
      })
    }
    await page.evaluate(
      (instanceId) =>
        document.querySelector('#remote-view').contentWindow.postMessage(
          {
            channel: 'xpertai.remote_component',
            protocolVersion: 1,
            instanceId,
            type: 'theme',
            theme: {
              mode: 'dark',
              density: 'compact',
              tokens: {
                colorBackground: '#09090b',
                colorForeground: '#fafafa',
                colorCard: '#18181b',
                colorCardForeground: '#fafafa',
                colorMuted: '#27272a',
                colorMutedForeground: '#a1a1aa',
                colorBorder: '#27272a',
                colorPrimary: '#fafafa',
                colorPrimaryForeground: '#18181b',
                colorInput: '#3f3f46',
                colorSecondary: '#27272a',
                colorSecondaryForeground: '#fafafa',
                colorAccent: '#27272a',
                colorAccentForeground: '#fafafa',
                colorPopover: '#18181b',
                colorPopoverForeground: '#fafafa',
              },
            },
          },
          '*',
        ),
      config.instanceId,
    )
    await expect(frame.locator('html')).toHaveClass('dark')
    const theme = await frame.locator('html').evaluate((el) => {
      const style = getComputedStyle(el)
      return ['--border', '--input', '--ring'].map((k) =>
        style.getPropertyValue(k),
      )
    })
    assert.ok(theme.every(Boolean))
    await expect
      .poll(() =>
        frame
          .locator('body')
          .evaluate((el) => getComputedStyle(el).backgroundColor),
      )
      .toBe('rgb(9, 9, 11)')
    await expect
      .poll(() =>
        frame
          .getByRole('button', { name: '案例信息', exact: true })
          .evaluate((el) => getComputedStyle(el).color),
      )
      .toBe('rgb(250, 250, 250)')
    if (screenshotDir)
      await page.screenshot({
        path: resolve(screenshotDir, 'studio-preview-dark.png'),
      })
    assert.deepEqual(errors, [])
    console.log(
      JSON.stringify({
        measurements,
        requests: preview.state.requests,
        actions: preview.state.actions,
        executionNavigation: true,
      }),
    )
  } finally {
    await browser.close()
    await preview.close()
  }
})
