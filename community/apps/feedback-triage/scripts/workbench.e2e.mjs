import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { chromium } from 'playwright-core'

const require = createRequire(import.meta.url)
const channel = 'xpertai.remote_component'
const source = '提交订单后一直停在加载页面，刷新两次仍然无法确认订单。'
const analysis = {
  category: 'bug',
  summary: '订单确认页一直加载',
  quote: '一直停在加载页面',
  nextStep: '核查订单确认请求及页面错误。'
}

// A test View Host. The bundle runs inside an opaque-origin iframe like the real Workbench.
async function frameDocument() {
  const umd = (name) =>
    readFile(join(dirname(require.resolve(name + '/package.json')), 'umd', name + '.production.min.js'), 'utf8')
  const [react, dom, js, css] = await Promise.all([
    umd('react'),
    umd('react-dom'),
    readFile(new URL('../dist/remote/workbench.js', import.meta.url), 'utf8'),
    readFile(new URL('../dist/remote/workbench.css', import.meta.url), 'utf8')
  ])
  const script = (content) => '<script>' + content.replace(/<\/script/gi, '<\\/script') + '</script>'
  return (
    '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>' +
    css +
    '</style><div id="root"></div>' +
    [react, dom, js].map(script).join('')
  )
}

function mockStore() {
  const tickets = []
  const requestIds = new Map()
  const calls = []
  let loseFirstCreateReceipt = true
  return {
    tickets,
    calls,
    reply(message) {
      if (message.type === 'requestData') {
        const start = (message.query.page - 1) * 30
        const scoped = message.scopeRevision === 1 ? tickets : []
        return {
          type: 'data',
          data: { item: { tickets: scoped.slice(start, start + 30), hasMore: scoped.length > start + 30 } }
        }
      }
      assert.equal(message.scopeRevision, 1)
      const { actionKey, input } = message
      calls.push({ actionKey, ...input })
      let ticket
      if (actionKey === 'create_ticket') {
        ticket = requestIds.get(input.requestId)
        if (!ticket) {
          const now = new Date().toISOString()
          ticket = {
            id: randomUUID(),
            source: input.source,
            status: 'draft',
            confirmedCategory: null,
            attempts: 0,
            analysis: null,
            errorCode: null,
            createdAt: now,
            updatedAt: now
          }
          tickets.unshift(ticket)
          requestIds.set(input.requestId, ticket)
        }
        if (loseFirstCreateReceipt) {
          loseFirstCreateReceipt = false
          return { type: 'error', message: 'Simulated lost response' }
        }
      } else {
        ticket = tickets.find((row) => row.id === input.id)
        assert.ok(ticket)
        if (actionKey === 'analyze_ticket') {
          ticket.attempts++
          if (ticket.attempts === 1) Object.assign(ticket, { status: 'failed', errorCode: 'model_unavailable' })
          else Object.assign(ticket, { status: 'review', errorCode: null, analysis })
        } else {
          assert.equal(actionKey, 'confirm_ticket')
          assert.equal(ticket.status, 'review')
          ticket.status = 'confirmed'
          ticket.confirmedCategory = input.category ?? ticket.analysis.category
        }
      }
      return { type: 'actionResult', result: { success: true, data: { ticket } } }
    }
  }
}

test(
  'built iframe assets preserve drafts, retry the same ticket, confirm corrections and recover after reload',
  { timeout: 90_000 },
  async (t) => {
    const fixture = mockStore()
    const frame = await frameDocument()
    const host = `<!doctype html><html><head><meta charset="utf-8"><style>html,body,iframe{width:100%;height:100%;margin:0;border:0}</style></head>
    <body><iframe title="Workbench" sandbox="allow-downloads allow-forms allow-popups allow-popups-to-escape-sandbox allow-scripts"></iframe><script>
    const frame = document.querySelector('iframe');
    const instanceId = 'test-instance', channel = ${JSON.stringify(channel)};
    let revision = 1;
    const send = (message) => frame.contentWindow.postMessage({ channel, instanceId, protocolVersion: 1, scopeRevision: revision, ...message }, '*');
    window.toolCompleted = () => send({ type: 'hostEvent', event: { type: 'assistant.tool.completed', toolName: 'feedback_analyze' } });
    window.switchContext = () => { revision++; send({ type: 'hostEvent', event: { type: 'view.context.changed', data: { revision } } }); };
    window.setViewLocale = (locale) => send({ type: 'init', locale, theme: { mode: 'light' } });
    window.addEventListener('message', async ({source, data}) => {
      if (source !== frame.contentWindow || data?.channel !== channel) return;
      if (data.type === 'ready') return window.setViewLocale('zh-Hans');
      if (data.instanceId === instanceId && ['requestData', 'executeAction'].includes(data.type)) {
        const answer = await window.fixtureReply(data);
        send({ ...answer, requestId: data.requestId });
      }
    });
    frame.src = '/view';
    </script></body></html>`
    const server = createServer((req, res) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(req.url === '/view' ? frame : host)
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    t.after(() => new Promise((resolve) => server.close(resolve)))
    const browser = await chromium.launch(
      process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chrome' }
    )
    t.after(() => browser.close())
    const page = await browser.newPage({ viewport: { width: 1080, height: 760 } })
    page.setDefaultTimeout(10_000)
    const pageErrors = []
    page.on('pageerror', (err) => pageErrors.push(err.message))
    await page.exposeFunction('fixtureReply', (request) => fixture.reply(request))
    await page.goto('http://127.0.0.1:' + server.address().port)
    const ui = page.frameLocator('iframe')
    const feedback = ui.getByRole('textbox')
    await ui.getByText('还没有工单。提交第一条客户反馈后，可以在这里重新打开。').waitFor()
    const submit = ui.getByRole('button', { name: '保存并生成建议' })
    await submit.press('Enter')
    await ui.getByText('请输入 10 到 2400 个字符的客户原话。').waitFor()
    assert.equal(fixture.calls.length, 0)
    await feedback.fill(source)
    await page.evaluate(() => window.setViewLocale('en-US'))
    await ui.getByRole('heading', { name: 'Customer feedback triage' }).waitFor()
    assert.equal(await feedback.inputValue(), source)
    await page.evaluate(() => window.setViewLocale('zh-Hans'))

    await submit.click()
    await ui.getByText('无法完成工作台请求，请刷新工单后重试。').waitFor()
    assert.equal(await feedback.inputValue(), source)
    await submit.click()
    await ui.getByRole('button', { name: '重试分诊' }).waitFor()
    assert.equal(fixture.tickets.length, 1)
    assert.equal(fixture.calls[0].requestId, fixture.calls[1].requestId)
    assert.equal(fixture.tickets[0].status, 'failed')
    assert.equal(fixture.tickets[0].source, source)
    await ui.getByRole('button', { name: '重试分诊' }).click()
    await ui.getByRole('button', { name: '确认并保存建议' }).waitFor()
    assert.equal(await ui.locator('blockquote').textContent(), analysis.quote)
    assert.equal(fixture.tickets[0].status, 'review')
    await ui.getByRole('combobox', { name: '最终分类' }).click()
    await ui.getByRole('option', { name: '使用体验' }).click()
    await ui.getByRole('button', { name: '确认并保存建议' }).click()
    await ui.getByText('分诊建议已由人工确认并保存。').waitFor()
    await page.reload()
    await ui.getByText('分诊建议已由人工确认并保存。').waitFor()
    assert.equal(fixture.tickets[0].status, 'confirmed')
    assert.equal(fixture.tickets[0].attempts, 2)
    assert.equal(fixture.tickets[0].analysis.category, 'bug')
    assert.equal(fixture.tickets[0].confirmedCategory, 'usability')
    await ui.getByText('AI 原建议为功能故障').waitFor()
    assert.equal(await ui.getByRole('button', { name: '确认并保存建议' }).count(), 0)
    if (process.env.WORKBENCH_E2E_SCREENSHOT) await page.screenshot({ path: process.env.WORKBENCH_E2E_SCREENSHOT })
    await page.setViewportSize({ width: 375, height: 740 })
    assert.equal(
      await ui.locator('body').evaluate((body) => body.scrollWidth <= document.documentElement.clientWidth),
      true
    )
    await page.setViewportSize({ width: 1080, height: 760 })
    // Assistant-created tickets enter through the same host query, including later pages.
    const originalId = fixture.tickets[0].id
    for (let i = 0; i < 30; i++) fixture.tickets.unshift({ ...fixture.tickets[0], id: randomUUID() })
    await page.evaluate(() => window.toolCompleted())
    const next = ui.getByRole('button', { name: '下一页' })
    await next.scrollIntoViewIfNeeded()
    await next.click()
    await ui.getByText('第 2 页').waitFor()
    await ui.getByRole('button', { name: '查看工单 ' + originalId.slice(0, 8) }).click()
    await ui.getByRole('button', { name: '新建反馈' }).click()
    await feedback.fill(source)
    // A trusted scope change discards drafts and data belonging to the previous user context.
    await page.evaluate(() => window.switchContext())
    await ui.getByText('还没有工单。提交第一条客户反馈后，可以在这里重新打开。').waitFor()
    assert.equal(await feedback.inputValue(), '')
    await feedback.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    })
    await ui.getByRole('button', { name: '刷新工单' }).click()
    await ui.getByRole('button', { name: '保存并生成建议' }).click()
    await ui.getByText('请输入 10 到 2400 个字符的客户原话。').waitFor()
    assert.equal(await ui.getByRole('alert').count(), 1)
    assert.equal(await ui.getByRole('button', { name: '查看工单 ' + originalId.slice(0, 8) }).count(), 0)
    assert.deepEqual(pageErrors, [])
  }
)
