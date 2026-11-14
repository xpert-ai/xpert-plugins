import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { setTimeout } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { assistantId, credentials, output, request, saveLocal, view, webOrigin } from './api.mjs'
import { launchBrowser, signIn } from './browser-support.mjs'

const title = '针对管件铸造企业的报价助手'
const opener = '请打开询价报价工作台，创建一条演示询价。'
let phase = 'check published entry configuration'
let browser
let page

// Observe only: clicking a Workbench tab here would hide a broken default entry.
async function visibleWorkbench(page) {
  const until = Date.now() + 45_000
  while (Date.now() < until) {
    for (const frame of page.frames()) {
      if (frame !== page.mainFrame() && await frame.getByRole('heading', {
        name: /^(针对管件铸造企业的报价助手|Quotation assistant for pipe fitting foundries)$/
      }).isVisible().catch(() => false) && await frame.getByRole('button', {
        name: /^(新建询价|New inquiry)$/
      }).isEnabled().catch(() => false)) return frame
    }
    await setTimeout(250)
  }
  throw new Error('Default Workbench did not open')
}

try {
  const team = await request(`/xpert/${assistantId}/team?data=${encodeURIComponent(JSON.stringify({}))}`)
  assert.equal(team.options.workbench.defaultViewKey, view)
  assert.equal(team.features.opener.enabled, true)
  assert.ok(team.features.opener.questions.includes(opener))
  browser = await launchBrowser()
  page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1520, height: 930 } })
  let messageRuns = 0
  page.on('request', (req) => {
    if (req.method() === 'POST') {
      let type
      try { type = JSON.parse(req.postData() || '{}').type } catch {}
      if (/\/runs(?:\/|$)/.test(new URL(req.url()).pathname) ||
        ['threads.create', 'threads.add_user_message'].includes(type)) messageRuns++
    }
  })
  phase = 'sign in and select organization'
  await signIn(page, credentials, `/chat/x/${assistantId}/c`)
  phase = 'click assistant from the platform sidebar'
  await page.goto(`${webOrigin}/chat`, { waitUntil: 'domcontentloaded' })
  const switcher = page.locator('button[data-onboarding-target="scope-switcher"]')
  const compact = page.locator('xp-cloud-sidebar .cloud-sidebar-identity__compact')
  await switcher.or(compact).first().waitFor({ timeout: 20_000 })
  if (!await switcher.isVisible()) {
    await compact.hover()
    await page.locator('xp-cloud-sidebar .cloud-sidebar-identity__collapse-button').click()
  }
  const entry = page.locator(`.cloud-sidebar-assistants__item[aria-label="${title}"]`)
  await entry.waitFor({ timeout: 30_000 })
  await entry.click()
  phase = 'verify assistant click navigation'
  await page.waitForURL((url) => url.pathname.includes(`/chat/x/${team.slug}/c`), { timeout: 20_000 })
  assert.equal(new URL(page.url()).searchParams.has('view'), false)
  phase = 'observe default Workbench after one click'
  await visibleWorkbench(page)
  await mkdir(output, { recursive: true })
  await page.screenshot({ path: fileURLToPath(new URL('entry-assistant.png', output)), animations: 'disabled' })
  phase = 'reload the assistant without a view URL parameter'
  await page.reload({ waitUntil: 'domcontentloaded' })
  await visibleWorkbench(page)
  assert.equal(messageRuns, 0, 'Direct entry must not submit a chat message')
  phase = 'start a fresh conversation for the opener'
  await page.goto(`${webOrigin}/chat/x/${assistantId}/c`, { waitUntil: 'domcontentloaded' })
  await visibleWorkbench(page)
  phase = 'send the original opener message'
  const chat = page.frameLocator('xpert-chatkit iframe').first()
  const [sent] = await Promise.all([
    page.waitForResponse((res) => res.request().method() === 'POST' && res.request().postData()?.includes(opener), { timeout: 30_000 }),
    chat.getByText(opener, { exact: true }).click({ timeout: 20_000 })
  ])
  assert.ok(sent.ok())
  await visibleWorkbench(page)
  assert.ok(messageRuns > 0)
  const legacyRuns = messageRuns
  phase = 'click native Quotation workbench menu'
  await page.getByRole('button', { name: 'Bosi', exact: true }).hover()
  await entry.hover()
  await page.getByRole('button', { name: /^(报价工作台|Quotation workbench)$/ }).click({ timeout: 20_000 })
  await page.waitForURL((url) => url.searchParams.get('view') === view && url.searchParams.get('viewLayout') === 'maximized')
  const app = await visibleWorkbench(page)
  await app.getByRole('button', { name: /^(新建询价|New inquiry)$/ }).click()
  await app.getByRole('textbox', { name: /^(询价标题|Inquiry title)$/ }).waitFor()
  assert.equal(messageRuns, legacyRuns, 'Workbench menu must not submit another chat message')
  await page.screenshot({ path: fileURLToPath(new URL('entry-workbench.png', output)), animations: 'disabled' })
  await saveLocal('entry-browser-result.json', {
    success: true, verifiedAt: new Date().toISOString(), assistantClick: true, reload: true,
    nativeWorkbenchMenu: true, newInquiryForm: true, openerRetained: true, directEntryMessageRuns: 0, legacyMessageAccepted: true,
    screenshots: ['entry-assistant.png', 'entry-workbench.png']
  })
  console.log('PASS direct entry without messages, refresh, native Workbench menu, inquiry form and original opener message')
} catch (error) {
  const pathname = page ? URL.parse(page.url())?.pathname : null
  const route = pathname?.startsWith('/chat/x/') ? 'assistant chat' : pathname === '/auth/login' ? 'login' : 'other'
  await saveLocal('entry-browser-result.json', { success: false, phase, error: error.name, route })
  console.error(`FAIL entry-browser during ${phase}`)
  process.exitCode = 1
} finally {
  await browser?.close()
}
