/** Production iframe + actual View provider + real scoped ORM services; the Xpert host
 * transport and paid model are explicit test doubles. This is not installed-host evidence. */
import 'reflect-metadata'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import { DataSource } from 'typeorm'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AIMessage } from '@langchain/core/messages'
import { ENTITIES } from '../dist/lib/photo-intake.plugin.js'
import { IntakeCase } from '../dist/lib/intake-case.entity.js'
import { IntakePhoto } from '../dist/lib/intake-photo.entity.js'
import { EvaluationRun } from '../dist/lib/evaluation-run.entity.js'
import { IntakeService } from '../dist/lib/intake.service.js'
import { EvaluationService } from '../dist/lib/evaluation.service.js'
import { EvaluationRunner } from '../dist/lib/evaluation.runner.js'
import { PhotoIntakeViewProvider } from '../dist/lib/intake-view.provider.js'
import { VIEW_KEY, REMOTE_ENTRY } from '../dist/lib/constants.js'

const scope = { tenantId: 'test-tenant', organizationId: 'test-org', userId: 'test-user', workspaceId: 'test-workspace', xpertId: 'test-assistant' }
const context = { ...scope, hostType: 'agent', hostId: scope.xpertId, slots: [] }
const db = new DataSource({ type: 'sqljs', entities: ENTITIES, synchronize: true })
await db.initialize()
const intake = new IntakeService(db.getRepository(IntakeCase), db.getRepository(IntakePhoto))
const evaluations = new EvaluationService(db.getRepository(EvaluationRun), intake)
const runner = new EvaluationRunner(evaluations, intake)
const provider = new PhotoIntakeViewProvider(intake, evaluations)
const entry = await provider.getRemoteComponentEntry(context, VIEW_KEY, { isolation: 'iframe', entry: REMOTE_ENTRY })
let activeRun
let calls = 0
const commands = []
const actions = []
class FixtureModel extends BaseChatModel {
  _llmType() { return 'explicit-e2e-fixture' }
  async _generate() {
    calls++
    const content = calls === 1 ? 'fixture malformed output' : JSON.stringify({ categoryId: 'plumbing', reason: 'Fixture response, not a real image interpretation.' })
    return { generations: [{ text: content, message: new AIMessage(content) }] }
  }
}
const runtime = {
  getDefaultChatModel: async () => ({ model: 'fixture-vision', copilotId: 'fixture-connection' }),
  createModelClient: async () => new FixtureModel({})
}
const host = `<!doctype html><html><head><meta charset="utf-8"><title>Evaluation test host</title>
<style>html,body{margin:0;height:100%}iframe{width:100%;height:100%;border:0;display:block}</style></head>
<body><iframe id="view" title="Evaluation workbench" sandbox="allow-downloads allow-forms allow-popups allow-scripts" src="/view"></iframe><script>
const frame=document.getElementById('view'); const channel='xpertai.remote_component'; const instanceId='test-view';
window.dataCalls=0;
const send=message=>frame.contentWindow.postMessage({channel,protocolVersion:1,instanceId,...message},'*');
window.setHost=(locale='zh-Hans',mode='light')=>send({type:'init',locale,theme:{mode,density:'default',tokens:mode==='dark'?{
 '--xui-color-border':'#444444','--xui-color-background':'#09090b','--xui-color-foreground':'#fafafa',
 '--xui-color-card':'#18181b','--xui-color-popover':'#18181b','--xui-color-secondary':'#27272a',
 '--xui-color-card-foreground':'#fafafa','--xui-color-popover-foreground':'#fafafa',
 '--xui-color-secondary-foreground':'#fafafa','--xui-color-accent-foreground':'#fafafa',
 '--xui-color-muted':'#27272a','--xui-color-muted-foreground':'#a1a1aa','--xui-color-primary':'#fafafa',
 '--xui-color-primary-foreground':'#18181b','--xui-color-accent':'#27272a'
}:{
 '--xui-color-border':'#dddddd','--xui-color-background':'#ffffff','--xui-color-foreground':'#18181b',
 '--xui-color-card':'#ffffff','--xui-color-popover':'#ffffff','--xui-color-secondary':'#f4f4f5',
 '--xui-color-card-foreground':'#18181b','--xui-color-popover-foreground':'#18181b',
 '--xui-color-secondary-foreground':'#18181b','--xui-color-accent-foreground':'#18181b',
 '--xui-color-muted':'#f4f4f5','--xui-color-muted-foreground':'#71717a','--xui-color-primary':'#18181b',
 '--xui-color-primary-foreground':'#ffffff','--xui-color-accent':'#f4f4f5'
}}});
addEventListener('message',async event=>{
 if(event.source!==frame.contentWindow || event.data?.channel!==channel)return;
 const message=event.data;
 if(message.type==='ready'){window.setHost();return}
 if(message.type==='resize')return;
 try{
  if(message.type==='requestData'){
   window.dataCalls++;
   const data=await fetch('/data',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(message.query)}).then(r=>r.json());
   send({type:'data',requestId:message.requestId,data});
  }else if(message.type==='executeAction'){
   const result=await fetch('/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(message)}).then(r=>r.json());
   send({type:'actionResult',requestId:message.requestId,result});
  }else if(message.type==='invokeClientCommand'){
   const result=await fetch('/command',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(message)}).then(r=>r.json());
   send({type:'clientCommandResult',requestId:message.requestId,result});send({type:'hostEvent'});
  }
 }catch{send({type:'error',requestId:message.requestId})}
});
</script></body></html>`
const server = createServer(async (req, res) => {
  try {
    if (req.method === 'GET') {
      res.setHeader('content-type', 'text/html; charset=utf-8')
      res.end(req.url === '/view' ? entry.html : host); return
    }
    let body = ''
    for await (const chunk of req) body += chunk
    const input = JSON.parse(body)
    let result
    if (req.url === '/data') result = await provider.getViewData(context, VIEW_KEY, input)
    else if (req.url === '/action') {
      actions.push(input.actionKey)
      result = await provider.executeViewAction(context, VIEW_KEY, input.actionKey, { input: input.input })
      if (input.actionKey === 'create_run' && result.success) activeRun = result.data.id
    } else if (req.url === '/command') {
      commands.push(input)
      assert.equal(input.commandKey, 'assistant.chat.send_message')
      assert.ok(input.payload.text.includes(activeRun))
      while ((await evaluations.get(scope, activeRun)).status === 'ready') await runner.next(scope, activeRun, runtime)
      result = { success: true }
    } else throw new Error('unexpected test endpoint')
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(result))
  } catch (error) { res.statusCode = 500; res.end(JSON.stringify({ error: String(error) })) }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) })
const page = await browser.newPage({ viewport: { width: 1120, height: 1000 } })
page.setDefaultTimeout(10000)
const errors = []
page.on('pageerror', error => errors.push(error.message))
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
const frame = page.frameLocator('#view')
const visible = async locator => { await locator.waitFor({ state: 'visible' }); return locator }
const click = async locator => { await visible(locator); await locator.click() }
const choose = async (label, option) => {
  await click(frame.getByRole('combobox', { name: label, exact: true }))
  const item = frame.getByRole('option', { name: option, exact: true })
  await click(item)
  // Radix restores focus when its closing overlay unmounts. Wait for that observable
  // transition before filling the next field or scrolling to another action.
  await item.waitFor({ state: 'hidden' })
}
const screenshotDir = process.env.WORKBENCH_E2E_SCREENSHOTS
async function screenshot(name) {
  if (screenshotDir) { await mkdir(screenshotDir, { recursive: true }); await page.screenshot({ path: join(screenshotDir, name), fullPage: true, animations: 'disabled' }) }
}
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  await visible(frame.getByRole('heading', { name: '图片分类版本验收', exact: true }))
  await page.frames().find(f => f.url().endsWith('/view')).evaluate(() => {
    window.fixtureClicks = []
    for (const name of ['pointerdown', 'pointerup', 'click']) {
      document.addEventListener(name, event => window.fixtureClicks.push({
        event: name, tag: event.target.tagName, text: event.target.textContent?.slice(0, 45), x: event.clientX, y: event.clientY
      }), true)
    }
  })
  assert.equal(await frame.getByRole('button', { name: '保存样本', exact: true }).isEnabled(), false)
  await frame.getByLabel('照片', { exact: true }).setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') })
  await visible(frame.getByText('这个文件无法作为照片读取，请换一张 JPG、PNG 或 WebP 图片。', { exact: true }))
  // Decode the encoded preview to check actual output pixels, rather than CSS size.
  // Small images must not be enlarged; landscape and portrait images must keep their aspect ratio.
  const uploadSizes = [
    { input: [80, 60], output: [80, 60] },
    { input: [1920, 2560], output: [960, 1280] },
    { input: [2560, 1920], output: [1280, 960] }
  ]
  const imageDimensions = async dataUrl => page.evaluate(async url => {
    const bitmap = await createImageBitmap(await (await fetch(url)).blob())
    try { return [bitmap.width, bitmap.height] } finally { bitmap.close() }
  }, dataUrl)
  for (const [index, size] of uploadSizes.entries()) {
    const base64 = await page.evaluate(([width, height]) => {
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#dde4ea'; ctx.fillRect(0, 0, width, height)
      ctx.fillStyle = '#71808b'; ctx.fillRect(width * 0.1, height / 3, width * 0.8, height * 0.2)
      return canvas.toDataURL('image/png').split(',')[1]
    }, size.input)
    const file = { name: `fixture-${index}.png`, mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') }
    const input = frame.getByLabel('照片', { exact: true })
    if (index === uploadSizes.length - 1) {
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), input.click()])
      await chooser.setFiles(file)
    } else await input.setInputFiles(file)
    const preview = frame.getByRole('img', { name: '已选择的照片' })
    await visible(preview)
    await frame.getByRole('status').waitFor({ state: 'hidden' })
    const dataUrl = await preview.getAttribute('src')
    assert.ok(dataUrl.startsWith('data:image/jpeg'))
    assert.deepEqual(await imageDimensions(dataUrl), size.output, `decoded dimensions for ${size.input.join('x')}`)
  }
  await frame.getByLabel('样本名称', { exact: true }).fill('Fixture image 1')
  await choose('人工参考类别', '给排水与漏水')
  const requestsBefore = await page.evaluate(() => window.dataCalls)
  await page.evaluate(() => window.setHost('en-US'))
  await visible(frame.getByRole('heading', { name: 'Image classification version acceptance', exact: true }))
  assert.equal(await frame.getByLabel('Sample name', { exact: true }).inputValue(), 'Fixture image 1')
  assert.equal(await page.evaluate(() => window.dataCalls), requestsBefore, 'locale-only init does not requery')
  await page.evaluate(() => window.setHost('zh-Hans'))
  await click(frame.getByRole('button', { name: '保存样本', exact: true }))
  await visible(frame.getByRole('button', { name: 'Fixture image 1', exact: true }))
  assert.equal((await intake.listCases(scope)).length, 1)
  const savedPhoto = (await intake.getCaseDetail(scope, (await intake.listCases(scope))[0].id)).photoDataUrl
  assert.ok(savedPhoto.startsWith('data:image/jpeg'))
  assert.deepEqual(await imageDimensions(savedPhoto), [1280, 960], 'persisted image has the resized dimensions')
  await click(frame.getByRole('tab', { name: '新建验收', exact: true }))
  await frame.getByLabel('验收名称', { exact: true }).fill('Fixture A/B acceptance')
  await frame.getByRole('checkbox', { name: 'Fixture image 1', exact: true }).check()
  await click(frame.getByRole('button', { name: '保存验收配置', exact: true }))
  await click(frame.getByRole('button', { name: '运行剩余 2 项', exact: true }))
  await visible(frame.getByRole('button', { name: '将 1 个失败项加入重试', exact: true }))
  assert.equal(calls, 2)
  await screenshot('comparison-failure.png')
  await click(frame.getByRole('button', { name: 'Fixture image 1', exact: true }))
  await visible(frame.getByText('fixture malformed output', { exact: true }))
  await choose('哪版输出更合适？', '采用 B')
  await frame.getByLabel('评审备注（可选）', { exact: true }).fill('A format failed; B valid.')
  await click(frame.getByRole('button', { name: '保存样本评审', exact: true }))
  await visible(frame.getByText('样本评审已保存。', { exact: true }))
  assert.equal((await evaluations.get(scope, activeRun)).reviews[0].verdict, 'b')
  await page.keyboard.press('Escape')
  await click(frame.getByRole('button', { name: '将 1 个失败项加入重试', exact: true }))
  await click(frame.getByRole('button', { name: '运行剩余 1 项', exact: true }))
  await visible(frame.getByRole('button', { name: '保存并定稿结论', exact: true }))
  assert.equal(calls, 3)
  const rerun = await evaluations.get(scope, activeRun)
  assert.equal(rerun.cells[0].attempts.length, 2)
  assert.equal(rerun.reviews.length, 1, 'previous review remains in history')
  await choose('采用决定', '采用 A')
  await frame.getByLabel('决定理由', { exact: true }).fill('Fixture acceptance: original failure retained; retry output reviewed.')
  await click(frame.getByRole('button', { name: '保存并定稿结论', exact: true }))
  await visible(frame.getByText('已保存结论', { exact: true }))
  assert.equal((await evaluations.get(scope, activeRun)).decision.verdict, 'a')
  await page.reload()
  await click(frame.getByRole('tab', { name: '验收记录', exact: true }))
  await click(frame.getByRole('button', { name: 'Fixture A/B acceptance', exact: true }))
  await visible(frame.getByText('Fixture acceptance: original failure retained; retry output reviewed.', { exact: true }))
  await screenshot('comparison-reviewed.png')
  await click(frame.getByRole('button', { name: 'Fixture image 1', exact: true }))
  await visible(frame.getByText('第 2 次尝试', { exact: false }))
  await screenshot('attempt-history.png')
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => window.setHost('en-US','dark'))
  await visible(frame.getByRole('heading', { name: 'Image classification version acceptance', exact: true }))
  const content = page.frames().find(f => f.url().endsWith('/view'))
  const layout = await content.evaluate(() => ({
    width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth,
    border: getComputedStyle(document.documentElement).getPropertyValue('--border'),
    background: getComputedStyle(document.body).backgroundColor
  }))
  assert.ok(layout.scroll <= layout.width, 'no page-wide horizontal overflow')
  assert.ok(layout.border.trim(), 'host semantic theme installed')
  assert.equal(layout.background, 'rgb(9, 9, 11)', 'dark host background propagated')
  assert.equal(await frame.getByText('Decision saved', { exact: true }).evaluate(element => getComputedStyle(element).color), 'rgb(250, 250, 250)')
  await screenshot('comparison-narrow-dark.png')
  assert.equal(commands.length, 2)
  assert.deepEqual(errors, [])
  if (screenshotDir) await writeFile(join(screenshotDir, 'receipt.json'), JSON.stringify({ simulatedHost: true, simulatedModel: true, calls, samples: 1, evaluations: 1, uploadSizes, cases: ['upload','file chooser event','decoded resize dimensions','persisted resize dimensions','locale preservation','failure','review','retry history','decision','reload','narrow dark theme'] }, null, 2))
  console.log('Workbench E2E passed: real upload/resize, A/B, failure/retry history, human decision, reload, locale and responsive theme. Host/model are fixtures.')
} catch (error) {
  await screenshot('failure-diagnostic.png')
  console.error('Fixture diagnostic:', {
    errors, text: await page.frames().find(f => f.url().endsWith('/view'))?.locator('body').innerText(),
    actions, clicks: await page.frames().find(f => f.url().endsWith('/view'))?.evaluate(() => window.fixtureClicks),
    layout: await page.frames().find(f => f.url().endsWith('/view'))?.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find(item => item.textContent.includes('保存并定稿结论'))
      const r = button?.getBoundingClientRect()
      const scroller = document.querySelector('.workbench-content')
      return { button: r?.toJSON(), hit: r ? document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.tagName : null, scrollTop: scroller?.scrollTop, scrollHeight: scroller?.scrollHeight, clientHeight: scroller?.clientHeight }
    }),
    samples: await intake.listCases(scope)
  })
  throw error
} finally {
  await browser.close(); await new Promise(resolve => server.close(resolve)); await db.destroy()
}
