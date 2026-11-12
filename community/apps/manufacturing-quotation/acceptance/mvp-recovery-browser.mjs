import assert from 'node:assert/strict'
import { assistantId, view, webOrigin } from './api.mjs'
import { captureWorkbench, chatPath, launchBrowser, signIn, workbench } from './browser-support.mjs'

const totalCny = '15.51'

export async function verifyRecoveryBrowser({ email, password, draftId, inquiry }) {
  const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
  assert.ok(uuid.test(draftId), 'A valid draft ID is required')
  assert.ok(typeof inquiry === 'string' && inquiry.trim(), 'Corrected inquiry is required')
  const path = chatPath(draftId)
  const dataPath = `/api/view-hosts/agent/${assistantId}/views/${view}/data`
  const screenshots = []
  let phase = 'launch'
  let browser

  try {
    browser = await launchBrowser()
    const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1520, height: 930 } })

    async function openDraft(navigate) {
      const [response, app] = await Promise.all([
        page.waitForResponse(async (candidate) => {
          if (!candidate.ok() || new URL(candidate.url()).pathname !== dataPath) return false
          const data = await candidate.json().catch(() => null)
          return data?.summary?.selected?.id === draftId
        }, { timeout: 45_000 }),
        navigate().then(() => workbench(page)),
      ])
      return { app, selected: (await response.json()).summary.selected }
    }

    async function capture(app, suffix) {
      screenshots.push(await captureWorkbench(app, `mvp-recovery-${suffix}.png`))
    }

    async function quoteVisible(app) {
      await app.getByRole('heading', { name: /^(已确认报价|Confirmed quotation)$/ }).waitFor({ timeout: 30_000 })
      await app.getByText(/^(CN)?¥15\.51$/).waitFor()
    }

    phase = 'sign in and select organization'
    await signIn(page, { email, password }, path)

    phase = 'verify prefilled inquiry'
    const { app, selected } = await openDraft(() => page.goto(`${webOrigin}${path}`, { waitUntil: 'domcontentloaded' }))
    assert.equal(selected.status, 'failed')
    assert.ok(selected.inquiry.trim() && selected.inquiry !== inquiry.trim(), 'Failed draft must contain original text to correct')
    const editor = app.getByRole('textbox', { name: /^(询价原文|Inquiry text)$/ })
    await editor.waitFor()
    assert.equal(await editor.inputValue(), selected.inquiry)
    await capture(app, 'prefilled')

    phase = 'save correction and identify'
    await editor.fill(inquiry)
    await app.getByRole('button', { name: /^(保存文字并识别商品|Save text and identify items)$/ }).click()
    await app.getByRole('heading', { name: /^(审核候选明细|Review items)$/ }).waitFor({ timeout: 90_000 })
    await capture(app, 'review')

    phase = 'confirm quote'
    await app.getByRole('button', { name: /^(确认并计算报价|Confirm and calculate quote)$/ }).click()
    await quoteVisible(app)

    phase = 'reload and verify the same draft'
    const reloaded = await openDraft(() => page.reload({ waitUntil: 'domcontentloaded' }))
    assert.equal(reloaded.selected.status, 'quoted')
    assert.equal(reloaded.selected.inquiry, inquiry.trim())
    assert.equal(reloaded.selected.quote?.total, totalCny)
    await quoteVisible(reloaded.app)
    await capture(reloaded.app, 'reloaded')
    return { prefilled: true, sameDraft: true, reloaded: true, totalCny, screenshots }
  } catch (error) {
    if (phase === 'sign in and select organization') throw error
    // Do not surface Playwright diagnostics, which can include filled inputs.
    throw new Error(`MVP browser recovery failed during ${phase}`)
  } finally {
    if (browser) await browser.close()
  }
}
