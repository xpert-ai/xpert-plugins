// End-to-end checks of the supplier delivery plugin against a running Xpert, driven by Playwright.
//
// Before running: deploy this plugin, create an assistant from its template, bind it to ClawXpert and
// configure a chat model. `flow` makes real model calls (about 1–2 minutes per reply) and confirms
// changes, so it rewrites the demo orders of the organization it runs in. `isolation` also needs a
// second organization with its own assistant (from the same template) bound to ClawXpert.
//
// Playwright is not a dependency of this plugin: it is loaded from XPERT_REPO (the Xpert platform repo
// installs it) or from a regular `playwright` install.
//
//   XPERT_REPO=<xpert repo> XPERT_URL=http://localhost:4200 XPERT_EMAIL=<account> XPERT_PASSWORD=<password> \
//   XPERT_ORG_ID=<organization> node e2e/platform-e2e.mjs flow [--shots <dir>] [--with-stop]
//
//   ... XPERT_ORG_ID_B=<second organization> node e2e/platform-e2e.mjs isolation
//
//   ... XPERT_ASSISTANT_ID=<normal assistant> XPERT_FAULT_ASSISTANT_ID=<assistant whose model the provider
//   rejects> node e2e/platform-e2e.mjs fault        (temporarily rebinds ClawXpert, always restores it)
//   Add XPERT_REFUSED_ASSISTANT_ID=<assistant the platform refuses to run> to also wait for the timeout fallback.
//
// XPERT_STATE=<file> reuses a saved browser session instead of logging in; keep that file outside the repo.
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

const [step = 'flow', ...rest] = process.argv.slice(2)
const option = (name) => rest.includes(name)
const shotsDir = rest.includes('--shots') ? rest[rest.indexOf('--shots') + 1] : null
const BASE = (process.env.XPERT_URL ?? 'http://localhost:4200').replace(/\/$/, '')
const VIEW = 'supplier_delivery.workbench__supplier_delivery.workbench'
const PARSE_WAIT_MS = 7 * 60_000
const RUN = `e2e ${Date.now()}`
// Same texts as the weekly_update, no_date and single_delay samples in src/lib/demo-data.ts, plus a run tag
// so each run creates new replies instead of reopening earlier ones.
const SAMPLES = {
  weekly:
    '王工好，同步下本周情况：\n1、弹簧组件热处理炉检修，要比原计划晚一周出货，数量不变；\n2、滑轨那单按原计划先发一半，剩下的 12 月 5 号前补齐；\n3、锁扣组件按原计划；\n4、铰链可以提前三天给到。\n发票下周一一起寄出。\n—— 虚构月榫组件屋 小李',
  noDate: 'DEMO-006 第2行铰链组件我们尽快安排，有进展再通知。',
  singleDelay: 'DEMO-001 第1行定位环100件，因设备检修，交期由2026-11-20延期到2026-11-28。'
}
const tagged = (text) => `${text}\n（${RUN}）`

async function loadPlaywright() {
  try {
    return await import('playwright')
  } catch {}
  if (process.env.XPERT_REPO) return createRequire(path.join(process.env.XPERT_REPO, 'package.json'))('playwright')
  throw new Error('Playwright not found: set XPERT_REPO to the Xpert platform repo, or install playwright.')
}
const { chromium } = await loadPlaywright()
const browser = await chromium.launch({ headless: true })

const results = []
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
function check(name, ok, detail = '') {
  results.push({ name, ok })
  log(ok ? 'PASS' : 'FAIL', name, detail)
}

/** A page logged in and switched to one organization. */
async function openSession(orgId) {
  const state = process.env.XPERT_STATE
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
    locale: 'zh-CN',
    storageState: state && fs.existsSync(state) ? state : undefined
  })
  const page = await context.newPage()
  await page.goto(`${BASE}/`)
  await page.waitForLoadState('networkidle').catch(() => {})
  if (page.url().includes('/auth/')) {
    if (!process.env.XPERT_EMAIL || !process.env.XPERT_PASSWORD)
      throw new Error('Set XPERT_EMAIL and XPERT_PASSWORD, or XPERT_STATE.')
    await page.goto(`${BASE}/auth/login`)
    await page.locator('#email').fill(process.env.XPERT_EMAIL)
    await page.locator('#password').fill(process.env.XPERT_PASSWORD)
    await page.locator('button[type=submit]').click()
    await page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 30_000 })
    if (state) await context.storageState({ path: state })
  }
  if (orgId) {
    await page.evaluate((id) => {
      const store = JSON.parse(localStorage.getItem('_xpertStore') ?? '{}')
      store.persist = {
        ...(store.persist ?? {}),
        organizationId: id,
        lastOrganizationId: id,
        activeScopeLevel: 'organization'
      }
      localStorage.setItem('_xpertStore', JSON.stringify(store))
    }, orgId)
  }
  return page
}

/** Opens the workbench and returns its iframe plus the view API the host itself uses (same token and organization). */
async function openWorkbench(page, { maximized = false } = {}) {
  let api = null
  const listener = (request) => {
    const url = request.url()
    if (!api && url.includes(`/views/${VIEW}/data?`)) {
      const headers = Object.fromEntries(
        Object.entries(request.headers()).filter(([key]) =>
          ['authorization', 'organization-id', 'tenant-id', 'language'].includes(key)
        )
      )
      api = { base: url.slice(0, url.indexOf('/data?')), headers }
    }
  }
  page.on('request', listener)
  // Always name the layout: the host remembers the last one, and the split layout keeps the chat on screen.
  await page.goto(`${BASE}/chat/clawxpert/c?view=${VIEW}&viewLayout=${maximized ? 'maximized' : 'split'}`)
  const end = Date.now() + 60_000
  let frame = null
  while (Date.now() < end && (!frame || !api)) {
    for (const f of page.frames()) {
      if (
        await f
          .getByRole('button', { name: '新建供应商回复' })
          .first()
          .isVisible({ timeout: 200 })
          .catch(() => false)
      )
        frame = f
    }
    if (!frame || !api) await page.waitForTimeout(500)
  }
  page.off('request', listener)
  if (!frame || !api) throw new Error('Workbench did not load: is an assistant from the template bound to ClawXpert?')
  await page.waitForTimeout(1500)
  const data = async (table, id) => {
    const res = await page.request.get(
      `${api.base}/data?parameters=${encodeURIComponent(JSON.stringify({ table, ...(id ? { id } : {}) }))}`,
      { headers: api.headers }
    )
    return res.json()
  }
  const action = async (key, targetId, input = {}) => {
    const res = await page.request.post(`${api.base}/actions/${key}`, {
      headers: api.headers,
      data: { targetId, input }
    })
    return res.json()
  }
  return { frame, data, action }
}

async function shot(page, name) {
  if (!shotsDir) return
  fs.mkdirSync(shotsDir, { recursive: true })
  await page.screenshot({ path: path.join(shotsDir, name) })
}

async function flash(frame, pattern) {
  const text = frame.getByText(pattern).first()
  await text.waitFor({ timeout: 30_000 })
  return (await text.textContent())?.trim()
}

/** Creates a reply through the dialog and returns its id from the create_reply response. */
async function createReply(page, frame, text, { parse }) {
  await frame.getByRole('button', { name: '新建供应商回复' }).first().click()
  await frame.locator('textarea').fill(text)
  const created = page.waitForResponse((r) => r.url().includes('/actions/create_reply'))
  await frame.getByRole('button', { name: parse ? '保存并解析' : '仅保存' }).click()
  return (await (await created).json()).data?.replyId
}

/** Waits until the workbench shows text matching the pattern; returns false on timeout. */
async function shows(frame, pattern, timeout) {
  return frame
    .getByText(pattern)
    .first()
    .waitFor({ timeout })
    .then(
      () => true,
      () => false
    )
}

async function waitParsed(data, replyId, minAttempt = 0) {
  const end = Date.now() + PARSE_WAIT_MS
  let reply = null
  while (Date.now() < end) {
    reply = (await data('reply', replyId)).meta
    // After a retry, wait until the new attempt has started before judging its result.
    if ((reply?.parseAttempt ?? 0) < minAttempt) {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      continue
    }
    // The workbench saves first and requests the parse right after, so 'received' is not a result yet.
    if (!['received', 'parsing'].includes(reply?.status) || reply.parseTimedOut) return reply
    await new Promise((resolve) => setTimeout(resolve, 5000))
  }
  return reply
}

async function flow() {
  const page = await openSession(process.env.XPERT_ORG_ID)
  // Reloading detaches the workbench iframe, so every step uses the latest opened view.
  let view = await openWorkbench(page, { maximized: true })
  const { frame, data } = view
  await shot(page, 'flow-01-workbench.png')

  await frame.getByRole('button', { name: '导入示例订单' }).click()
  log('import:', await flash(frame, /已导入 \d+ 条订单/))
  await page.waitForTimeout(1000)
  await frame.getByRole('button', { name: '导入示例订单' }).click()
  await page.waitForTimeout(1500)
  const again = (
    await frame
      .getByText(/已导入 \d+ 条订单/)
      .first()
      .textContent()
  )?.trim()
  check('再次导入示例订单不重复', /已导入 0 条订单/.test(again ?? ''), again)

  await frame.getByRole('button', { name: '新建供应商回复' }).first().click()
  await frame.getByRole('button', { name: '仅保存' }).click()
  check('空内容不能保存', Boolean(await flash(frame, '请先粘贴供应商的消息。').catch(() => null)))
  await frame.getByRole('button', { name: '取消' }).click()

  const weeklyText = tagged(SAMPLES.weekly)
  const weeklyId = await createReply(page, frame, weeklyText, { parse: true })
  log('weekly reply', weeklyId, 'parsing with the real model…')
  check('解析中显示已用时间', await shows(frame, /已用 .+，通常/, 30_000))
  // The first save can take two minutes or more, so the saved count is only waited for, not asserted.
  if (!(await shows(frame, /已保存 \d+ 条提议/, 150_000)))
    log('no proposal saved while waiting; screenshot shows the elapsed time only')
  await shot(page, 'flow-02-parsing.png')
  const weekly = await waitParsed(data, weeklyId)
  check(
    '周报解析完成并进入待确认',
    weekly?.status === 'pending_review',
    `${weekly?.status}, ${weekly?.proposals?.length ?? 0} 条提议`
  )
  for (const p of weekly?.proposals ?? [])
    log('  proposal', p.poNumber, p.lineNo, p.changeType, p.proposedDate, p.reason)
  check(
    '每条提议都带原文出处',
    (weekly?.proposals ?? []).every((p) => p.evidence?.length > 0)
  )

  check('同一段内容再保存时打开原记录', (await createReply(page, frame, weeklyText, { parse: false })) === weeklyId)
  await page.keyboard.press('Escape').catch(() => {})

  if (weekly?.status === 'pending_review') {
    await page.reload()
    view = await openWorkbench(page, { maximized: true })
    await view.frame.locator('aside').first().getByText('王工好').first().click()
    await page.waitForTimeout(2000)
    await view.frame.getByRole('button', { name: /全部采纳 \d+ 条/ }).click()
    await flash(view.frame, /已采纳 \d+ 条提议/)
    const decided = (await view.data('reply', weeklyId)).meta
    check(
      '「全部采纳」一次采纳所有待处理的提议',
      (decided?.proposals ?? []).length > 1 && decided.proposals.every((p) => p.decision === 'accepted'),
      `${(decided?.proposals ?? []).filter((p) => p.decision === 'accepted').length}/${decided?.proposals?.length ?? 0}`
    )
    await shot(page, 'flow-03-accept-all.png')
    await view.frame.getByRole('button', { name: /确认 \d+ 条变更/ }).click()
    await view.frame.getByText('变更已确认').first().waitFor({ timeout: 30_000 })
    await shot(page, 'flow-04-confirmed.png')
    await page.reload()
    view = await openWorkbench(page, { maximized: true })
    const confirmed = (await view.data('reply', weeklyId)).meta
    check('刷新后回复仍是已确认，并记下确认人', confirmed?.status === 'confirmed' && Boolean(confirmed.confirmedBy))
    const changed = confirmed?.proposals.find((p) => p.decision !== 'rejected')
    const line = changed && (await view.data('orderLine', changed.orderLineId)).meta
    check(
      '订单交期已更新并留下变更记录',
      Boolean(line?.changes?.some((c) => c.replyId === weeklyId)),
      line && `${line.poNumber} → ${line.promisedDate}`
    )
  }

  const noDateId = await createReply(page, view.frame, tagged(SAMPLES.noDate), { parse: true })
  const noDate = await waitParsed(view.data, noDateId)
  check(
    '没写交期时进入需跟进并写明原因',
    noDate?.status === 'needs_followup' && Boolean(noDate.failureMessage),
    noDate?.failureMessage ?? noDate?.status
  )

  // A reply whose proposals are all rejected must still be closable, and closing it must not change the order.
  // Its text differs from the stop scenario below, which would otherwise reopen this reply instead of parsing a new one.
  const rejectedId = await createReply(page, view.frame, `${tagged(SAMPLES.singleDelay)}（全部驳回）`, { parse: true })
  const rejectable = await waitParsed(view.data, rejectedId)
  if (rejectable?.status === 'pending_review' && rejectable.proposals.length) {
    const orderId = rejectable.proposals[0].orderLineId
    const before = (await view.data('orderLine', orderId)).meta
    for (const p of rejectable.proposals) await view.action('decide_proposal', p.id, { decision: 'rejected' })
    await page.reload()
    view = await openWorkbench(page, { maximized: true })
    await view.frame.locator('aside').first().getByText('DEMO-001 第1行').first().click()
    await page.waitForTimeout(2000)
    await view.frame.getByRole('button', { name: '全部驳回并结束' }).click()
    await flash(view.frame, /订单没有变化/)
    const closed = (await view.data('reply', rejectedId)).meta
    const after = (await view.data('orderLine', orderId)).meta
    check(
      '提议全部驳回后可以结束这封回复，订单不变',
      closed?.status === 'confirmed' &&
        after?.promisedDate === before?.promisedDate &&
        after?.quantity === before?.quantity &&
        after?.changes?.length === before?.changes?.length,
      `${closed?.status}，${after?.poNumber} 仍是 ${after?.promisedDate}`
    )
    await shot(page, 'flow-05-all-rejected-closed.png')
  } else {
    check('提议全部驳回后可以结束这封回复，订单不变', false, `解析结果是 ${rejectable?.status}`)
  }

  if (option('--with-stop')) {
    // The chat's stop button is only on screen in the split layout.
    view = await openWorkbench(page)
    const stalledId = await createReply(page, view.frame, tagged(SAMPLES.singleDelay), { parse: true })
    let stopped = false
    const end = Date.now() + 30_000
    while (!stopped && Date.now() < end) {
      for (const f of page.frames()) {
        const stop = f.getByRole('button', { name: /结束执行/ }).first()
        if (await stop.isVisible({ timeout: 200 }).catch(() => false)) {
          await stop.click()
          stopped = true
          break
        }
      }
      if (!stopped) await page.waitForTimeout(500)
    }
    check('能在对话里结束解析中的执行', stopped)
    if (stopped) {
      // A stop during a model call aborts it and is recorded within seconds; a stop between steps only pauses the
      // chat, which the plugin cannot see, so the workbench must offer to resend after its quiet spell instead.
      const started = Date.now()
      let after = null
      while (Date.now() - started < 30_000) {
        after = (await view.data('reply', stalledId)).meta
        if (after?.status !== 'parsing') break
        await page.waitForTimeout(3000)
      }
      const seconds = Math.round((Date.now() - started) / 1000)
      if (after?.status !== 'parsing') {
        check(
          '结束执行（模型调用中）后几秒内显示「解析被中止」（run_stopped）',
          after?.status === 'failed' && after.failureCode === 'run_stopped',
          `${after?.status} / ${after?.failureCode}，${seconds} 秒`
        )
        await shot(page, 'flow-05-run-stopped.png')
      } else {
        log('the stop landed between steps; the chat is paused and the reply is still parsing')
        const stalledShown = await shows(view.frame, /没有新的工具调用/, 240_000)
        check('结束执行（两步之间）后，150 秒没有工具调用时提示重新发送', stalledShown)
        if (stalledShown) {
          await shot(page, 'flow-05-stalled.png')
          await view.frame.getByRole('button', { name: '重新发送给助手' }).click({ timeout: 10_000 })
          const resent = await waitParsed(view.data, stalledId)
          check(
            '重新发送后在新对话里解析完成',
            resent?.status === 'pending_review',
            `${resent?.status}，${resent?.proposals?.length ?? 0} 条提议`
          )
        }
      }
    }
  }
  await page.context().close()
}

async function isolation() {
  const orgA = process.env.XPERT_ORG_ID
  const orgB = process.env.XPERT_ORG_ID_B
  if (!orgA || !orgB) throw new Error('Set XPERT_ORG_ID and XPERT_ORG_ID_B.')
  const pageA = await openSession(orgA)
  const a = await openWorkbench(pageA)
  const repliesA = (await a.data('replies')).meta
  const replyA = repliesA?.items?.find((r) => r.proposalCount > 0)
  if (!replyA) throw new Error('Organization A needs at least one parsed reply.')
  const detailA = (await a.data('reply', replyA.id)).meta
  const proposalA = detailA.proposals[0]
  const ordersA = (await a.data('orderLines')).meta
  log('organization A:', repliesA.total, 'replies,', ordersA.total, 'order lines')

  const pageB = await openSession(orgB)
  const b = await openWorkbench(pageB)
  const repliesB = (await b.data('replies')).meta
  const ordersB = (await b.data('orderLines')).meta
  await shot(pageB, 'isolation-org-b.png')
  check(
    '组织 B 的列表里没有组织 A 的回复',
    !repliesB?.items?.some((r) => r.id === replyA.id),
    `B 有 ${repliesB?.total} 封回复`
  )
  check(
    '组织 B 的列表里没有组织 A 的订单行',
    !ordersB?.items?.some((o) => o.id === proposalA.orderLineId),
    `B 有 ${ordersB?.total} 条订单行`
  )
  const codeOf = (result) => result?.error?.code ?? result?.code
  check('组织 B 按 id 读不到组织 A 的回复', codeOf(await b.data('reply', replyA.id)) === 'reply_not_found')
  check(
    '组织 B 按 id 读不到组织 A 的订单行',
    codeOf(await b.data('orderLine', proposalA.orderLineId)) === 'order_line_not_found'
  )
  check(
    '组织 B 不能审核组织 A 的提议',
    codeOf(await b.action('decide_proposal', proposalA.id, { decision: 'rejected' })) === 'proposal_not_found'
  )
  check(
    '组织 B 不能确认组织 A 的回复',
    codeOf(await b.action('confirm_reply', replyA.id, { expectedRevision: detailA.revision })) === 'reply_not_found'
  )
  check(
    '组织 B 不能重新解析组织 A 的回复',
    codeOf(await b.action('retry_parse', replyA.id, { locale: 'zh-Hans' })) === 'reply_not_found'
  )

  // Organization B works with its own data: the same demo orders and the same reply text create B's own rows.
  const imported = await b.action('import_demo_data')
  const ordersAfterImport = (await b.data('orderLines')).meta
  check(
    '组织 B 能导入自己的 12 条示例订单',
    imported?.success === true && ordersAfterImport?.total === 12,
    `created ${imported?.data?.created}, skipped ${imported?.data?.skipped}`
  )
  const sameText = await b.action('create_reply', undefined, { rawText: detailA.rawText })
  check(
    '同一段回复在组织 B 新建自己的记录，不和组织 A 冲突',
    sameText?.success === true && sameText.data?.replyId !== replyA.id,
    `created ${sameText?.data?.created}`
  )

  const after = (await a.data('reply', replyA.id)).meta
  check(
    '组织 A 的回复和提议没有被改动',
    after.status === detailA.status &&
      after.proposals[0].decision === proposalA.decision &&
      after.revision === detailA.revision
  )
  const totalsA = [(await a.data('replies')).meta?.total, (await a.data('orderLines')).meta?.total]
  check(
    '组织 A 的回复数和订单行数不变',
    totalsA[0] === repliesA.total && totalsA[1] === ordersA.total,
    totalsA.join(' / ')
  )
  await pageA.context().close()
  await pageB.context().close()
}

/** Binds ClawXpert to an assistant with the signed-in user's own token (the same call the binding wizard makes). */
async function bindClawXpert(page, apiOrigin, assistantId) {
  const token = await page.evaluate(() => JSON.parse(localStorage.getItem('_xpertStore') ?? '{}').persist?.token)
  const { tenantId } = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
  const organizationId = await page.evaluate(
    () => JSON.parse(localStorage.getItem('_xpertStore') ?? '{}').persist?.organizationId
  )
  const res = await page.request.post(`${apiOrigin}/api/assistant-binding`, {
    headers: { authorization: `Bearer ${token}`, 'tenant-id': tenantId, 'organization-id': organizationId },
    data: { code: 'clawxpert', scope: 'user', assistantId }
  })
  if (!res.ok()) throw new Error(`Binding ClawXpert failed with HTTP ${res.status()}`)
}

/**
 * A real model failure: ClawXpert is bound to an assistant whose model the provider rejects. The reply must fail
 * within seconds as model_failed, then a retry with the normal assistant must succeed on the same record without
 * duplicate proposals. The original binding is always restored.
 */
async function fault() {
  const faulty = process.env.XPERT_FAULT_ASSISTANT_ID
  const normal = process.env.XPERT_ASSISTANT_ID
  if (!faulty || !normal)
    throw new Error('Set XPERT_FAULT_ASSISTANT_ID (model the provider rejects) and XPERT_ASSISTANT_ID (normal).')
  const page = await openSession(process.env.XPERT_ORG_ID)
  let view = await openWorkbench(page, { maximized: true })
  const apiOrigin = new URL(
    await page.evaluate(
      () =>
        performance
          .getEntriesByType('resource')
          .map((e) => e.name)
          .find((n) => n.includes('/api/view-hosts/')) ?? location.href
    )
  ).origin
  try {
    await bindClawXpert(page, apiOrigin, faulty)
    view = await openWorkbench(page, { maximized: true })
    const replyId = await createReply(page, view.frame, tagged(SAMPLES.singleDelay), { parse: true })
    const started = Date.now()
    const failed = await waitParsed(view.data, replyId)
    const seconds = Math.round((Date.now() - started) / 1000)
    check(
      '模型报错后回复立即标为解析失败（model_failed）',
      failed?.status === 'failed' && failed.failureCode === 'model_failed',
      `${failed?.status} / ${failed?.failureCode}，${seconds} 秒`
    )
    check('失败在 60 秒内落盘，不用等超时', seconds < 60, `${seconds} 秒`)
    await shot(page, 'fault-01-model-failed.png')

    await bindClawXpert(page, apiOrigin, normal)
    view = await openWorkbench(page, { maximized: true })
    await view.frame.locator('aside').first().getByText('DEMO-001 第1行').first().click()
    await page.waitForTimeout(1500)
    await view.frame.getByRole('button', { name: '重新解析' }).first().click()
    const retried = await waitParsed(view.data, replyId, (failed?.parseAttempt ?? 0) + 1)
    const lines = (retried?.proposals ?? []).map((p) => p.orderLineId)
    check(
      '换回正常模型后，同一封回复重试成功',
      retried?.status === 'pending_review' && retried.parseAttempt === failed?.parseAttempt + 1,
      `${retried?.status}，第 ${retried?.parseAttempt} 次解析`
    )
    check('重试没有产生重复提议', lines.length > 0 && new Set(lines).size === lines.length, `${lines.length} 条提议`)
    await shot(page, 'fault-02-retried.png')

    // The platform can refuse to start a run (for example an unauthorized model). No model call happens, so only
    // the parse timeout can notice it.
    const refused = process.env.XPERT_REFUSED_ASSISTANT_ID
    if (refused) {
      await bindClawXpert(page, apiOrigin, refused)
      view = await openWorkbench(page, { maximized: true })
      const refusedId = await createReply(page, view.frame, `${tagged(SAMPLES.singleDelay)}（平台拒绝运行）`, {
        parse: true
      })
      log('platform refuses the run; waiting for the stall warning, then the five-minute parse timeout…')
      check('平台拒绝运行时，150 秒没有工具调用就提示重新发送', await shows(view.frame, /没有新的工具调用/, 240_000))
      await shot(page, 'fault-03-stalled.png')
      const timedOut = await waitParsed(view.data, refusedId)
      check(
        '平台拒绝运行时，5 分钟超时兜底显示「解析未完成」',
        timedOut?.status === 'parsing' && timedOut.parseTimedOut === true,
        `${timedOut?.status}，parseTimedOut=${timedOut?.parseTimedOut}`
      )
      await page.reload()
      view = await openWorkbench(page, { maximized: true })
      await view.frame
        .locator('aside')
        .first()
        .getByText('平台拒绝运行')
        .first()
        .click()
        .catch(() => {})
      await page.waitForTimeout(1500)
      await shot(page, 'fault-04-timeout-fallback.png')
    }
  } finally {
    await bindClawXpert(page, apiOrigin, normal).catch((error) =>
      log('could not restore the ClawXpert binding:', error.message)
    )
    await page.context().close()
  }
}

try {
  if (step === 'flow') await flow()
  else if (step === 'isolation') await isolation()
  else if (step === 'fault') await fault()
  else throw new Error(`Unknown step "${step}": use flow, isolation or fault.`)
} finally {
  await browser.close()
}
const failed = results.filter((r) => !r.ok)
log(`${results.length - failed.length}/${results.length} checks passed`)
process.exitCode = failed.length ? 1 : 0
