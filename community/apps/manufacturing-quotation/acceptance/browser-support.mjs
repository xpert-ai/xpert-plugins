import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { setTimeout } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { assistantId, output, requiredEnv, view, webOrigin } from './api.mjs'

const require = createRequire(import.meta.url)
const workbenchName = /^(针对管件铸造企业的报价助手|Quotation assistant for pipe fitting foundries)$/

export function launchBrowser() {
  const { chromium } = require(process.env.MANUFACTURING_PLAYWRIGHT_MODULE || 'playwright-core')
  const executablePath = process.env.MANUFACTURING_BROWSER_PATH
  return chromium.launch(executablePath ? { executablePath } : { channel: process.env.MANUFACTURING_BROWSER_CHANNEL || 'chrome' })
}

export function chatPath(draftId) {
  const params = new URLSearchParams({ view, viewLayout: 'split' })
  if (draftId) params.set('viewParameters', JSON.stringify({ draftId }))
  return `/chat/x/${assistantId}/c?${params}`
}

export async function signIn(page, { email, password }, path) {
  let phase = 'open login form'
  try {
    const organization = requiredEnv('XPERT_ORG_NAME').trim()
    await page.goto(`${webOrigin}/auth/login?returnUrl=${encodeURIComponent(path)}`, { waitUntil: 'domcontentloaded' })
    await page.locator('#email').waitFor({ timeout: 40_000 })
    assert.equal(new URL(page.url()).origin, webOrigin)
    phase = 'submit login form'
    await page.locator('#email').fill(email)
    await page.locator('#password').fill(password)
    await page.locator('form button[type="submit"]').click()
    phase = 'wait for assistant route'
    await page.waitForURL((url) => url.origin === webOrigin && url.pathname.startsWith('/chat/x/'), { timeout: 30_000 })

    phase = 'find sidebar'
    const switcher = page.locator('button[data-onboarding-target="scope-switcher"]')
    const compact = page.locator('xp-cloud-sidebar .cloud-sidebar-identity__compact')
    await switcher.or(compact).first().waitFor({ timeout: 20_000 })
    if (await compact.isVisible()) {
      phase = 'expand sidebar'
      await compact.hover()
      await compact.locator('.cloud-sidebar-identity__collapse-button').click()
    }

    phase = 'wait for organization scope'
    const selected = switcher.locator('.cloud-sidebar-identity__title').and(page.getByText(organization, { exact: true }))
    const menuTrigger = switcher.and(page.locator('.can-open'))
    await selected.or(menuTrigger).first().waitFor({ timeout: 25_000 })
    if (await selected.isVisible()) return

    phase = 'open organization menu'
    await menuTrigger.click()
    phase = 'select organization'
    await page.locator('.cloud-sidebar-identity__menu').getByText(organization, { exact: true }).click()
    phase = 'verify selected organization'
    await selected.waitFor({ timeout: 25_000 })
  } catch (error) {
    const pathname = URL.parse(page.url())?.pathname
    const route = pathname?.startsWith('/chat/x/') ? 'assistant chat' : pathname === '/auth/login' ? 'login' : 'other'
    const kind = error?.name === 'TimeoutError' ? 'timeout' : 'operation error'
    // Playwright diagnostics can include filled inputs.
    throw new Error(`Browser sign-in failed during ${phase} (${kind}, route: ${route})`)
  }
}

export async function workbench(page) {
  const tab = page.frameLocator('xpert-chatkit iframe').first().getByRole('tab', { name: workbenchName })
  const until = Date.now() + 45_000
  while (Date.now() < until) {
    for (const frame of page.frames()) {
      if (frame !== page.mainFrame() &&
        await frame.getByRole('heading', { name: workbenchName }).isVisible().catch(() => false)) return frame
    }
    if (await tab.isVisible().catch(() => false) && await tab.getAttribute('aria-selected') === 'false') {
      await tab.click({ timeout: 5_000 })
    }
    await setTimeout(250)
  }
  throw new Error('Quotation workbench did not become ready')
}

export async function captureWorkbench(app, filename) {
  await mkdir(output, { recursive: true })
  await app.getByRole('main').screenshot({ path: fileURLToPath(new URL(filename, output)), animations: 'disabled' })
  return filename
}
