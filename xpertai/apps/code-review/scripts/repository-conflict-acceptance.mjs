// Run after build. Fixture responses exercise the actual iframe/bridge/UI without external writes.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import { startRemoteViewPreview } from '../../../../tools/remote-view-preview/preview-host.mjs'
import config from './repository-conflict-preview.config.mjs'

const preview = await startRemoteViewPreview(config)
const browser = await chromium.launch({ headless: true,
  ...(process.env.XPERT_TEST_CHROMIUM ? { executablePath: process.env.XPERT_TEST_CHROMIUM } : {}) })
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
const errors = []
page.on('pageerror', error => errors.push(error.message))
const chinese = config.hostContext.locale.startsWith('zh')
const addLabel = chinese ? '添加仓库' : 'Add repository'
try {
  await page.goto(preview.url)
  const frame = page.frameLocator('iframe')
  const input = frame.locator('input[placeholder="owner/repository"]')
  const notice = frame.getByRole('alert')
  async function submit(name) {
    await input.fill(`fixture/${name}`)
    await frame.getByRole('button', { name: addLabel, exact: true }).click()
  }
  await submit('other-organization')
  await notice.filter({ hasText: '维护人乙' }).waitFor()
  assert.match(await notice.innerText(), /配置人甲/)
  assert.doesNotMatch(await notice.innerText(), /已有代码审查助手/)
  if (process.env.XPERT_TEST_SCREENSHOTS) {
    await mkdir(process.env.XPERT_TEST_SCREENSHOTS, { recursive: true })
    await page.screenshot({ path: join(process.env.XPERT_TEST_SCREENSHOTS, `ownership-${config.hostContext.locale}-${process.env.PREVIEW_THEME ?? 'light'}.png`), fullPage: true })
  }
  await submit('other-assistant')
  await notice.filter({ hasText: '已有代码审查助手' }).waitFor()
  assert.match(await notice.innerText(), chinese ? /当前组织的另一个助手/ : /another Assistant in this organization/)
  await submit('other-tenant')
  await notice.filter({ hasText: chinese ? '其他租户' : 'another tenant' }).waitFor()
  assert.doesNotMatch(await notice.innerText(), /示例研发组织|维护人乙|配置人甲|已有代码审查助手/)
  await submit('legacy')
  await notice.filter({ hasText: 'fixture-configurer' }).waitFor()
  assert.match(await notice.innerText(), chinese ? /名称未记录/ : /Name not recorded/)
  await submit('unauthorized')
  await notice.filter({ hasText: chinese ? '写入或管理权限' : 'write or admin access' }).waitFor()
  assert.doesNotMatch(await notice.innerText(), /维护人乙|fixture-configurer/)
  await submit('other-organization')
  await notice.filter({ hasText: '维护人乙' }).waitFor()
  await submit('allowed')
  await notice.waitFor({ state: 'detached' })
  await frame.locator('input[placeholder="owner/repository"][value=""]').waitFor()
  assert.equal(await input.inputValue(), '')
  await submit('other-organization')
  await notice.filter({ hasText: '维护人乙' }).waitFor()
  await page.evaluate(() => document.querySelector('iframe').contentWindow.postMessage({
    channel: 'xpertai.remote_component', protocolVersion: 1, type: 'hostEvent', instanceId: 'code-review-fixture',
    event: { type: 'view.context.changed', data: { revision: 2, runtimeScope: { projectId: null, conversationId: null } } }
  }, '*'))
  await notice.waitFor({ state: 'detached' })
  assert.deepEqual(errors, [])
  console.log('PASS repository conflicts: organization, Assistant, tenant redaction, legacy, denied access, retry and context change')
} catch (error) {
  console.error('Browser errors:', errors)
  console.error('View:', await page.frameLocator('iframe').locator('body').innerText().catch(() => 'unavailable'))
  throw error
} finally {
  await browser.close()
  await preview.close()
}
