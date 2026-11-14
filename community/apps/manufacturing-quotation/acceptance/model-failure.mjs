import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { assistantId, credentials, output, request, requiredEnv, saveLocal, view, webOrigin } from './api.mjs'
import { launchBrowser, signIn, workbench } from './browser-support.mjs'

// Fault injection changes only a new test Assistant's output limit, never credentials or the regular Assistant.
const workspaceId = requiredEnv('XPERT_WORKSPACE_ID').trim()
assert.match(workspaceId, /^[0-9a-f-]{36}$/i)
const relations = encodeURIComponent(JSON.stringify({ relations: ['copilotModel', 'agent', 'agent.copilotModel'] }))
const team = (id) => request(`/xpert/${id}/team?data=${relations}`)
async function setModel(id, model, title) {
  await request(`/xpert/${id}/sync-template`, { method: 'POST', body: {} })
  const current = await team(id)
  assert.ok(current.draft?.team && current.draft.nodes)
  await request(`/xpert/${id}/draft`, { method: 'PUT', body: { ...current.draft,
    team: { ...current.draft.team, title, copilotModel: model },
    nodes: current.draft.nodes.map((node) => node.type === 'agent' ? { ...node, entity: { ...node.entity, copilotModel: null } } : node)
  } })
  await request(`/xpert/${id}/publish`, { method: 'POST', body: { releaseNotes: '隔离的本地模型故障验收配置' } })
  return team(id)
}
const original = await team(assistantId)
const modelIdentity = (model) => model && ({ model: model.model, copilotId: model.copilotId, modelType: model.modelType, options: model.options })
const originalIdentity = ({ id, slug, version, title, publishAt, draft, copilotModel, agent }) =>
  ({ id, slug, version, title, publishAt, draft, copilotModel: modelIdentity(copilotModel), agentModel: modelIdentity(agent?.copilotModel) })
const originalSnapshot = originalIdentity(original)
const template = encodeURIComponent('@xpert-ai/plugin-manufacturing-quotation:manufacturing-quotation-assistant')
const title = '模型失败与原单重试（合成验收）'
const inquiry = '玛钢 90°弯头，规格 25，1 箱；玛钢三通，规格 25，1 箱。'
let testId, browser, safeToDelete = false, phase = 'install temporary Assistant'
const evidence = { kind: 'incomplete-model-output-and-retry', success: false, screenshots: [] }

try {
  const setup = await request(`/xpert-template/${template}/setup?workspaceId=${workspaceId}`)
  assert.equal(setup.canInstall, true)
  const selected = setup.models.find(({ id }) => id === setup.defaultModelId)
  assert.equal(selected?.copilotModel.model, 'deepseek-flash')
  const normalModel = { ...selected.copilotModel, options: { thinking: false, max_tokens: 4096, maxRetries: 0 } }
  const installed = await request(`/xpert-template/${template}/install`, { method: 'POST', body: {
    workspaceId, locale: 'zh-Hans', publish: true,
    basic: { name: `manufacturing-model-retry-${randomUUID()}`, title: '报价助手 · 模型故障验收',
      copilotModel: { ...normalModel, options: { ...normalModel.options, max_tokens: 1 } } }
  } })
  testId = installed.xpert?.id
  assert.ok(testId && testId !== assistantId, 'Temporary Assistant must have a new ID')
  const initial = await team(testId)
  assert.ok(initial.slug && initial.slug !== original.slug, 'Temporary Assistant must have an independent slug')
  safeToDelete = true
  const temporary = await setModel(testId, { ...normalModel, options: { ...normalModel.options, max_tokens: 1 } }, installed.xpert.title)
  assert.notEqual(temporary.slug, original.slug, 'Temporary Assistant must have a new slug')
  assert.equal(temporary.copilotModel.options.max_tokens, 1, 'Fault output limit must be 1')
  assert.equal(temporary.copilotModel.model, normalModel.model)
  assert.equal(temporary.copilotModel.copilotId, normalModel.copilotId ?? normalModel.copilot?.id, 'Existing model connection must be reused')
  evidence.model = normalModel.model
  evidence.outputLimit = temporary.copilotModel.options.max_tokens
  evidence.assistantId = testId
  const base = `/view-hosts/agent/${testId}/views/${view}`
  const path = `/chat/x/${testId}/c?${new URLSearchParams({ view, viewLayout: 'split' })}`
  const get = async (id) => (await request(`${base}/data?parameters=${encodeURIComponent(JSON.stringify({ draftId: id }))}`)).summary.selected

  phase = 'open actual Xpert workbench'
  browser = await launchBrowser()
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1520, height: 930 } })
  const page = await context.newPage()
  const threads = []
  const browserErrors = []
  page.on('pageerror', (error) => browserErrors.push(error.name))
  page.on('request', (request) => {
    const match = /\/api\/ai\/threads\/([a-f0-9-]{36})\/runs\/stream$/.exec(new URL(request.url()).pathname)
    if (match) threads.push(match[1])
  })
  await signIn(page, credentials, path)
  await page.goto(`${webOrigin}${path}`, { waitUntil: 'domcontentloaded' })
  let app = await workbench(page)
  await app.getByRole('button', { name: /^(新建询价|New inquiry)$/ }).click()
  await app.getByRole('textbox', { name: /^(询价标题|Inquiry title)$/ }).fill(title)
  await app.getByRole('textbox', { name: /^(询价原文|Inquiry text)$/ }).fill(inquiry)

  phase = 'incomplete model output leaves an editable failed inquiry'
  await app.getByRole('button', { name: /^(保存并识别商品|Save and identify items)$/ }).click()
  await app.getByRole('alert').filter({ hasText: /本次识别未完成|Recognition did not complete/ }).waitFor({ timeout: 90_000 })
  const records = (await request(`${base}/data`)).summary.records
  assert.equal(records.filter((record) => record.title === title).length, 1)
  const failed = await get(records.find((record) => record.title === title).id)
  assert.equal(failed.status, 'failed')
  assert.equal(failed.errorCode, 'analysis_failed')
  assert.equal(failed.inquiry, inquiry)
  assert.equal(failed.quote, null)
  assert.deepEqual(failed.lines, [])
  assert.ok(threads.length)
  evidence.failed = { draftId: failed.id, revision: failed.revision, errorCode: failed.errorCode, quoteAbsent: true, inquiryPreserved: true }
  await mkdir(output, { recursive: true })
  await page.screenshot({ path: fileURLToPath(new URL('model-failure.png', output)), animations: 'disabled' })
  evidence.screenshots.push('model-failure.png')
  console.log('PASS incomplete model output is visible; original inquiry kept with no quote')

  phase = 'restore only the temporary Assistant model options'
  const restored = await setModel(testId, normalModel, temporary.title)
  assert.equal(restored.id, testId)
  assert.equal(restored.slug, temporary.slug)
  assert.equal(restored.copilotModel.options.max_tokens, 4096)

  phase = 'retry the same inquiry through the workbench'
  const selectedPath = path + `&viewParameters=${encodeURIComponent(JSON.stringify({ draftId: failed.id }))}`
  await page.goto(`${webOrigin}${selectedPath}`, { waitUntil: 'domcontentloaded' })
  app = await workbench(page)
  await app.getByRole('button', { name: /^(重试识别|Retry identification)$/ }).click()
  await app.getByRole('heading', { name: /^(审核候选明细|Review items)$/ }).waitFor({ timeout: 90_000 })
  const review = await get(failed.id)
  assert.equal(review.status, 'review')
  assert.equal(review.inquiry, inquiry)
  assert.equal(review.lines.length, 2)
  await page.screenshot({ path: fileURLToPath(new URL('model-retry-review.png', output)), animations: 'disabled' })
  evidence.screenshots.push('model-retry-review.png')
  phase = 'capture current tool trace'
  const traceFrame = page.frames().find((frame) => frame !== page.mainFrame() && frame !== app && frame.url().includes('chatkit'))
  if (traceFrame) {
    const tool = traceFrame.getByText(/^(Save review candidates|保存待核对候选)$/).first()
    const group = traceFrame.getByText(/^(Processed \d+ tools?|已处理\s*\d+\s*个工具)/).first()
    if (!await tool.isVisible() && await group.isVisible()) await group.click()
    if (await tool.isVisible()) {
      const box = await tool.boundingBox()
      const summary = await group.isVisible() ? await group.boundingBox() : null
      assert.ok(box)
      const x = Math.max(0, Math.floor(box.x - 24))
      const y = Math.max(0, Math.floor((summary?.y ?? box.y) - 10))
      await page.screenshot({ path: fileURLToPath(new URL('tools.png', output)),
        clip: { x, y, width: Math.ceil(box.width + 100), height: Math.ceil(box.y + box.height - y + 12) } })
      evidence.screenshots.push('tools.png')
    }
  }

  phase = 'confirm and reload'
  await app.getByRole('button', { name: /^(确认并计算报价|Confirm and calculate quote)$/ }).click()
  await app.getByRole('heading', { name: /^(已确认报价|Confirmed quotation)$/ }).waitFor()
  const quoted = await get(failed.id)
  assert.equal(quoted.quote.total, '15.51')
  const confirmation = await request(`${base}/actions/confirm`, { method: 'POST', body: {
    input: { id: quoted.id, revision: quoted.revision, lines: quoted.lines }
  } })
  assert.equal(confirmation.success, true)
  assert.deepEqual(confirmation.data.draft, quoted)
  await page.reload({ waitUntil: 'domcontentloaded' })
  app = await workbench(page)
  await app.getByRole('heading', { name: /^(已确认报价|Confirmed quotation)$/ }).waitFor()
  await app.getByText(/^(CN)?¥15\.51$/).waitFor()
  assert.deepEqual(await get(failed.id), quoted)
  assert.equal((await request(`${base}/data`)).summary.records.length, 1)
  await page.screenshot({ path: fileURLToPath(new URL('model-recovered.png', output)), animations: 'disabled' })
  evidence.screenshots.push('model-recovered.png')
  evidence.recovered = { draftId: quoted.id, total: quoted.quote.total, revision: quoted.revision, sameRecord: true, reloaded: true, duplicateConfirmationUnchanged: true }
  assert.deepEqual(browserErrors, [])
  evidence.success = true
  console.log('PASS same-record retry, human confirmation, idempotency and reload')
} catch (error) {
  evidence.failurePhase = phase
  evidence.failure = error.name
  console.error(`Model failure acceptance stopped during ${phase} (${error.name}${error.code === 'ERR_ASSERTION' ? ': ' + error.message.split('\n')[0] : ''})`)
  process.exitCode = 1
} finally {
  try { if (browser) await browser.close() } catch { evidence.browserCloseFailed = true; process.exitCode = 1 }
  if (safeToDelete) {
    try {
      await request(`/xpert/${testId}`, { method: 'DELETE' })
      try { await team(testId); evidence.temporaryAssistantDeleted = false }
      catch (error) { evidence.temporaryAssistantDeleted = [403, 404].includes(error.status) }
      if (!evidence.temporaryAssistantDeleted) process.exitCode = 1
    } catch { evidence.temporaryAssistantDeleted = false; process.exitCode = 1 }
  }
  try { evidence.regularAssistantUnchanged = isDeepStrictEqual(originalIdentity(await team(assistantId)), originalSnapshot) }
  catch { evidence.regularAssistantUnchanged = false }
  if (!evidence.regularAssistantUnchanged) process.exitCode = 1
  evidence.success &&= !process.exitCode
  evidence.completedAt = new Date().toISOString()
  await saveLocal('model-failure.json', evidence)
  console.log(JSON.stringify({ success: evidence.success, temporaryAssistantDeleted: evidence.temporaryAssistantDeleted, regularAssistantUnchanged: evidence.regularAssistantUnchanged }))
}
