import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import config, { platformRoot } from './preview.config.mjs'
const { startRemoteViewPreview } = await import(resolve(platformRoot, 'tools/remote-view-preview/preview-host.mjs'))
const { chromium } = createRequire(resolve(platformRoot, 'package.json'))('playwright')

for (const variant of [{ locale: 'zh-Hans', width: 480, dark: false }, { locale: 'en-US', width: 344, dark: true }]) {
  test(`profile decisions, isolation and disposal (${variant.locale}, ${variant.width}px)`, async (t) => {
    const theme = variant.dark ? { mode: 'dark', tokens: {
      colorBackground: '#09090b', colorForeground: '#fafafa', colorCard: '#18181b', colorCardForeground: '#fafafa',
      colorPopover: '#18181b', colorPopoverForeground: '#fafafa', colorMuted: '#27272a', colorMutedForeground: '#a1a1aa',
      colorSecondary: '#27272a', colorSecondaryForeground: '#fafafa', colorBorder: '#3f3f46', colorInput: '#3f3f46',
      colorPrimary: '#2dd4bf', colorPrimaryForeground: '#042f2e', colorRing: '#2dd4bf'
    } } : config.hostContext.theme
    const preview = await startRemoteViewPreview({ ...config, state: structuredClone(config.state), logStartup: false, logErrors: false, isolatedOrigin: true,
      hostContext: { ...config.hostContext, locale: variant.locale, theme } }, { port: 0 })
    t.after(() => preview.close())
    const browser = await chromium.launch({ headless: true })
    t.after(() => browser.close())
    const page = await browser.newPage({ viewport: { width: variant.width + 32, height: 680 } })
    const capture = async (name) => {
      const output = process.env.PROFILE_SCREENSHOT_DIR
      if (output) { await mkdir(output, { recursive: true }); await page.locator('#remote-view').screenshot({ animations: 'disabled', path: resolve(output, `profile-${variant.locale}-${name}.png`) }) }
    }
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(preview.url)
    // Exercise the production opaque-origin sandbox and profile's constrained viewport.
    await page.locator('#remote-view').evaluate((frame, width) => {
      frame.style.width = `${width}px`; frame.style.height = '380px'
      frame.style.minHeight = '0'
    }, variant.width)
    const frame = page.frameLocator('#remote-view')
    const chinese = variant.locale.startsWith('zh')
    await frame.getByRole('heading', { name: chinese ? /待处理/ : /Needs attention/ }).waitFor()
    await frame.getByRole('button', { name: /FAC-/ }).waitFor()
    await page.waitForTimeout(150)
    assert.equal(preview.state.requestDataCount, 1, 'Initial activation makes one data request')
    const setActive = (active) => page.locator('#remote-view').evaluate((element, next) => {
      element.contentWindow?.postMessage({
        channel: 'xpertai.remote_component', protocolVersion: 1,
        instanceId: 'factory-assistant-profile-preview', type: 'viewActive', active: next
      }, '*')
    }, active)
    await setActive(false)
    await page.waitForTimeout(5_200)
    assert.equal(preview.state.requestDataCount, 1, 'Inactive cached view pauses polling')
    await setActive(true)
    await page.waitForTimeout(150)
    assert.equal(preview.state.requestDataCount, 1, 'Reactivation reuses cached data without an immediate request')
    await page.waitForTimeout(5_200)
    assert.equal(preview.state.requestDataCount, 2, 'Polling resumes from the next interval')
    if (variant.dark) assert.equal(await frame.locator('main').evaluate((element) => getComputedStyle(element).backgroundColor), 'rgb(9, 9, 11)')
    await capture('cases')
    await frame.getByRole('button', { name: /FAC-/ }).click()
    const approve = chinese ? '批准并继续' : 'Approve and continue'
    const reject = chinese ? '拒绝' : 'Reject'
    const cancel = chinese ? '取消' : 'Cancel'
    assert.equal(await frame.getByRole('heading', { name: chinese ? '处理方式' : 'How to handle' }).isVisible(), true)
    assert.equal(await frame.getByRole('button', { name: approve, exact: true }).getAttribute('data-size'), 'sm')
    assert.equal(await frame.getByRole('button', { name: chinese ? '刷新' : 'Refresh' }).getAttribute('data-size'), 'icon-sm')
    await frame.getByRole('button', { name: approve, exact: true }).click()
    const dialog = frame.getByRole('alertdialog')
    await dialog.waitFor()
    assert.equal(await dialog.getAttribute('data-size'), 'sm')
    assert.equal(await dialog.getByRole('button', { name: cancel, exact: true }).getAttribute('data-size'), 'sm')
    await capture('approval')
    await dialog.getByRole('button', { name: cancel, exact: true }).click()
    assert.equal(preview.state.actions.length, 0, 'Cancellation must not dispatch actions')
    await frame.getByRole('button', { name: reject, exact: true }).click()
    assert.equal(await dialog.getByRole('button', { name: reject, exact: true }).isDisabled(), true)
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(preview.state.commands.filter((command) => command.key === 'assistant.profile.close').length, 0, 'Dialog consumes Escape first')
    await frame.getByRole('button', { name: approve, exact: true }).click()
    preview.state.failNextAction = true
    await dialog.getByRole('button', { name: approve, exact: true }).click()
    await dialog.getByRole('alert').waitFor()
    assert.equal(await dialog.locator('textarea').isDisabled(), true)
    await dialog.getByRole('button', { name: approve, exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(preview.state.actions.length, 2)
    assert.deepEqual(preview.state.actions[0], preview.state.actions[1], 'Retries preserve operation ID and payload')
    assert.equal(preview.state.commands.some((command) => command.key === 'assistant.profile.interaction' && command.payload.busy), true)
    const geometry = await frame.locator('body').evaluate((body) => ({ scroll: body.scrollWidth, width: innerWidth }))
    assert.ok(geometry.scroll <= geometry.width + 1, 'No horizontal overflow')
    const output = process.env.PROFILE_SCREENSHOT_DIR
    if (output) { await mkdir(output, { recursive: true }); await page.locator('#remote-view').screenshot({ path: resolve(output, `profile-${variant.locale}.png`) }) }
    await page.locator('#remote-view').evaluate((element) => element.remove())
    const requests = preview.state.requestDataCount
    await new Promise((done) => setTimeout(done, 5200))
    assert.equal(preview.state.requestDataCount, requests, 'Unmount stops polling')
    assert.deepEqual(errors, [])
  })
}
