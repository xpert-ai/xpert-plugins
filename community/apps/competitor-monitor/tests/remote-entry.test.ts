// 自动化验证：使用隔离测试数据验证业务结果，不连接真实店铺或操作平台记录。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { CompetitorMonitorViewProvider } from '../dist/lib/view.provider.js'
import { VIEW, REMOTE_ENTRY } from '../dist/lib/constants.js'

// 验证目标：宿主拒绝发送时不显示分析成功。
test('analysis sends text and does not report success when the host rejects it', async () => {
  const html = await readFile(new URL('../dist/remote/index.html', import.meta.url), 'utf8')
  const source = html.match(/analyze.onclick=\(\)=>\{([\s\S]*?)\};\n\nasync function dispatchAnalysis/)?.[1]
  assert.ok(source)
  const notice = { textContent: '' }
  const analyze = { classList: { add() { throw new Error('must not hide on failure') } } }
  let captured: object | undefined
  const send = async (_type: string, payload: object) => { captured = payload; return { result: { success: false } } }
  let prepared: object | undefined
  const action = async (key: string, input: object) => { prepared = {key,input}; return {analysisMessage:'round-message'} }
  new Function('send', 'notice', 'analyze', 'currentRound', 'action', 'setNotice',
    html.slice(html.indexOf('const errorLabels='), html.indexOf('const iconPaths=')) + html.slice(html.indexOf('async function dispatchAnalysis'), html.indexOf('let deletionPlan=null;')) + source
  )(send, notice, analyze, () => ({id:'selected-round'}), action, (text: string) => { notice.textContent=text })
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(prepared, {key:'prepare_analysis',input:{roundId:'selected-round'}})
  assert.deepEqual(captured, { commandKey: 'assistant.chat.send_message', payload: { text: 'round-message' } })
  assert.equal(notice.textContent, '分析请求未发送成功，请重试')
  assert.doesNotMatch(html, /payload:\{message:/)
})

// 验证目标：提供者实际返回构建后的页面。
test('built provider serves the actual remote HTML', async () => {
  // Entry loading does not use the service or host context.
  const entry = await CompetitorMonitorViewProvider.prototype.getRemoteComponentEntry(
    Object.create(null), VIEW, { isolation: 'iframe', entry: REMOTE_ENTRY }
  )
  const html = await readFile(new URL('../dist/remote/index.html', import.meta.url), 'utf8')
  assert.equal(entry.html, html)
  assert.equal(entry.contentType, 'text/html; charset=utf-8')
})

// 验证目标：重试回执恢复分析入口并清理旧提示。
test('collection result re-enables analysis after retry and clears stale messages on failure', async () => {
  const html = await readFile(new URL('../dist/remote/index.html', import.meta.url), 'utf8')
  const source = html.match(/function handleCollectionResult\(data\)\{([\s\S]*?)\}\nrun.onclick=/)?.[1]
  assert.ok(source)
  const execute = new Function('data', `const failureItem={value:'fault'},notice={textContent:''};let analysisMessage='old';const classes=new Set();const analyze={classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)}};(function(){${source}})();return {analysisMessage,hidden:classes.has('hidden'),notice:notice.textContent}`)
  const ok = execute({ round: { status: 'success' }, changes: [1], analysisMessage: 'round-2' })
  assert.equal(ok.analysisMessage, 'round-2')
  assert.equal(ok.hidden, false)
  const failed = execute({ round: { status: 'failed', errorReason: 'timeout' } })
  assert.equal(failed.analysisMessage, '')
  assert.equal(failed.hidden, true)
  assert.equal(failed.notice, 'timeout')
})


// 验证目标：中文状态和北京时间格式化。
test('status badges and dates use Chinese labels and Shanghai time', async () => {
  const html = await readFile(new URL('../dist/remote/index.html', import.meta.url), 'utf8')
  const helpers = html.slice(html.indexOf('const statusLabels='), html.indexOf('const errorLabels='))
  const ui = new Function(helpers + ';return {statusBadge,formatTime,fieldLabels}')()
  assert.match(ui.statusBadge('approved'), /badge-green.*已采纳/)
  assert.match(ui.statusBadge('failed'), /badge-red.*采集失败/)
  assert.match(ui.statusBadge('pending'), /badge-amber.*待审核/)
  assert.match(ui.statusBadge('paused'), /已暂停/)
  assert.equal(ui.fieldLabels.promotion_adjustment, '促销调整')
  assert.match(ui.formatTime('2026-11-04T06:07:13Z'), /14:07:13.*北京时间/)
  assert.equal(ui.formatTime('invalid'), '时间未知')
})


// 验证目标：建议展示转义文本并携带审核版本。
test('product groups retain evidence, escape content, and bind approval to advice revision', async () => {
  const html = await readFile(new URL('../dist/remote/index.html', import.meta.url), 'utf8')
  const helper = html.slice(html.indexOf('const escapeHtml='), html.indexOf('const errorLabels='))
  const render = html.slice(html.indexOf('function renderGroup('), html.indexOf("document.addEventListener('click'"))
  const group = new Function('dataset','selectedTab','icon',helper+render+';return renderGroup')({items:[{itemId:'6543210',title:'<script>test</script>'}]},'all',()=> '')
  const output = group('6543210',[{id:'c1',dimension:'price',beforeValue:'199',afterValue:'179',evidence:'mock:6543210:price'}],[{id:'a1',changeId:'c1',category:'promotion_adjustment',content:'<b>建议</b>',status:'pending',revision:4}])
  assert.match(output, /-10.1%/)
  assert.match(output, /&lt;script&gt;/)
  assert.match(output, /&lt;b&gt;建议/)
  assert.match(output, /data-id="a1" data-rev="4"/)
  assert.match(output, /mock:6543210:price/)
  assert.match(output, /采纳不会自动执行/)
})
