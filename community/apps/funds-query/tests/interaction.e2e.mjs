// Production UI + middleware + Python; fixture model allows independent result/reply timing.
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {join} from 'node:path'
import {randomUUID} from 'node:crypto'
import {chromium} from 'playwright-core'
import {createPreviewHost} from './preview-host.mjs'
const root=fileURLToPath(new URL('../',import.meta.url)),host=await createPreviewHost()
const browser=await chromium.launch({executablePath:process.env.FUNDS_QUERY_BROWSER||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']})
const page=await browser.newPage({viewport:{width:1440,height:1120}});page.setDefaultTimeout(20000)
const errors=[];page.on('pageerror',e=>errors.push(e.message))
await mkdir(join(root,'test-results'),{recursive:true})
let checks=0,releaseReply,firstSession
const first='张三2026年10月收款'
async function check(name,run){await run();checks++;console.log('PASS',name)}
async function until(test){for(let i=0;i<200;i++){if(await test())return;await page.waitForTimeout(100)}throw Error('Test condition timed out')}
try{
 host.failNextRead('chat');await page.goto(host.url)
 const frame=page.frameLocator('iframe'),composer=frame.getByLabel('你想了解这批交易的什么？')
 const sendButton=()=>frame.getByRole('button',{name:'发送消息',exact:true})
 const refreshButton=()=>frame.locator('.page-header').getByRole('button',{name:'刷新',exact:true})
 async function send(text){const before=await frame.locator('.chat-turn').count();await composer.fill(text);await sendButton().click();await until(async()=>await frame.locator('.chat-turn').count()>before);await frame.locator('.user-message').getByText(text,{exact:true}).last().waitFor()}
 async function latestReply(){await until(async()=>await frame.locator('.composer .activity-ring').count()===0&&await frame.locator('.assistant-progress').count()===0&&await frame.locator('.message-prose').last().isVisible())}
 await check('initial read failure offers refresh instead of claiming there is no data',async()=>{
  await frame.getByRole('heading',{name:'暂时无法读取工作台数据'}).waitFor()
  assert.equal(await frame.getByRole('heading',{name:'让数据回答你的问题'}).count(),0)
  await refreshButton().click();await frame.getByRole('heading',{name:'让数据回答你的问题'}).waitFor()
  assert.equal(await frame.getByRole('alert').count(),0)
 })
 await check('file import has its own progress state',async()=>{
  const release=host.holdNext('import')
  await frame.getByLabel('选择标准交易 Excel').setInputFiles(join(root,'examples/交易明细-标准样例.xlsx'))
  await frame.getByRole('button',{name:'正在校验文件…'}).waitFor()
  assert.equal(await frame.getByText('处理中',{exact:true}).count(),0)
  release();await frame.getByRole('heading',{name:'这次想了解资金的哪一面？'}).waitFor()
 })
 await check('pending question immediately joins the timeline and allows drafting the next question',async()=>{
  host.deferNextQuery();releaseReply=host.holdNext('reply')
  await send(first);await frame.locator('.assistant-progress').waitFor()
  assert.equal(await frame.getByRole('button',{name:'正在校验文件…'}).count(),0)
  assert.equal(await frame.locator('.answer-amount').count(),0)
  await composer.fill('下一题草稿不能被清空')
 })
 await check('saved result appears before final reply and retains independently readable evidence',async()=>{
  await host.completeDeferredQuery();await releaseReply.blocked
  await frame.locator('.answer-amount').last().filter({hasText:'90,000.13'}).waitFor()
  await frame.locator('.assistant-progress').getByText('助手正在回复…',{exact:true}).waitFor()
  assert.equal(await frame.locator('.message-prose').count(),0)
  await frame.getByRole('button',{name:'查看交易依据'}).click()
  await frame.getByRole('dialog').getByText('T002',{exact:true}).waitFor()
  await frame.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).first().click()
  await page.screenshot({path:join(root,'test-results/conversation-processing.png'),fullPage:true})
 })
 await check('switching to a new conversation during a reply cannot leak the old result or draft',async()=>{
  await frame.getByRole('button',{name:/新建会话/}).click()
  await frame.getByRole('heading',{name:'这次想了解资金的哪一面？'}).waitFor()
  assert.equal(await composer.inputValue(),'')
  assert.equal(await frame.locator('.chat-turn').count(),0)
  releaseReply()
  await until(async()=>await frame.getByText(/另一个会话正在提交或回复/).count()===0)
  assert.equal(await frame.locator('.chat-turn').count(),0)
  await frame.getByRole('navigation',{name:'会话',exact:true}).getByRole('button',{name:first,exact:true}).click()
  await frame.locator('.message-prose').first().waitFor()
  assert.equal(await composer.inputValue(),'下一题草稿不能被清空')
  const datasetId=(await host.service.context(host.scope)).currentDataset.id
  firstSession=(await host.service.view(host.scope,'chat',{datasetId})).session
 })
 await check('explicit rejection preserves the user message and a retry stays in the same session',async()=>{
  await page.request.get(host.url+'/fail-next');await send('张三全部收款')
  await frame.getByRole('alert').getByText(/问题未能发送/).waitFor()
  await until(async()=>!(await sendButton().isDisabled()))
  assert.equal(await composer.inputValue(),'张三全部收款')
  const beforeRetry=await frame.locator('.chat-turn').count()
  await sendButton().click();await until(async()=>await frame.locator('.chat-turn').count()>beforeRetry);await latestReply()
  assert.equal(await frame.getByRole('alert').count(),0)
 })
 await page.clock.install()
 await check('lost reply receipt preserves a saved result and a late answer recovers without any host event',async()=>{
  await page.evaluate(()=>window.setPreviewEventsEnabled(false))
  const rejectedBefore=host.requests.filter(r=>r.actionKey==='dispatch_failed').length
  const release=host.holdNext('reply')
  await send('张三全部收款');await release.blocked
  await frame.locator('.answer-amount').last().filter({hasText:'90,000.13'}).waitFor()
  await until(async()=>!(await refreshButton().isDisabled()))
  const proseCount=await frame.locator('.message-prose').count()
  await composer.fill('保留回执超时期间的草稿');await page.clock.fastForward(41000)
  await frame.locator('.turn-notice').last().filter({hasText:'分析结果已保存'}).waitFor()
  assert.equal(host.requests.filter(r=>r.actionKey==='dispatch_failed').length,rejectedBefore)
  assert.equal(await composer.inputValue(),'保留回执超时期间的草稿')
  assert.equal(await frame.getByRole('alert').count(),0)
  release();await until(async()=>await frame.locator('.message-prose').count()>proseCount)
  assert.equal(await composer.inputValue(),'保留回执超时期间的草稿')
 })
 await check('receipt timeout before calculation does not mark the question as failed',async()=>{
  const rejectedBefore=host.requests.filter(r=>r.actionKey==='dispatch_failed').length
  host.deferNextQuery();const release=host.holdNext('reply')
  await send('再看全部收款');await frame.locator('.assistant-progress').last().waitFor()
  await until(async()=>!(await refreshButton().isDisabled()))
  await page.clock.fastForward(41000)
  await frame.locator('.assistant-progress').last().filter({hasText:'尚未收到助手回执'}).waitFor()
  assert.equal(host.requests.filter(r=>r.actionKey==='dispatch_failed').length,rejectedBefore)
  assert.equal(await sendButton().isDisabled(),true)
  await host.completeDeferredQuery();await release.blocked;release()
  await latestReply();await page.evaluate(()=>window.setPreviewEventsEnabled(true))
 })
 let restoreSession
 await check('a lost navigation receipt cannot block a confirmed followup',async()=>{
  await frame.getByRole('button',{name:/新建会话/}).click()
  await frame.getByRole('heading',{name:'这次想了解资金的哪一面？'}).waitFor()
  await send('新会话张三全部收款');await latestReply()
  const datasetId=(await host.service.context(host.scope)).currentDataset.id
  restoreSession=(await host.service.view(host.scope,'chat',{datasetId})).session
  await frame.getByRole('navigation',{name:'会话',exact:true}).getByRole('button',{name:first,exact:true}).click()
  await frame.locator('.chat-turn').first().waitFor()
  const release=host.holdNext('navigation_receipt')
  await send('只看超过5万元的');await release.blocked;await latestReply()
  assert.match(await frame.locator('.answer-amount').last().innerText(),/60,000.00/)
  assert.equal(host.threads.get(firstSession.conversationId).messages.at(-1),'只看超过5万元的')
  release()
 })
 await check('navigation timeout preserves the draft without creating an unsent pending question',async()=>{
  host.setNativeThread(restoreSession.conversationId)
  const before=host.requests.filter(r=>r.actionKey==='prepare').length
  const turnCount=await frame.locator('.chat-turn').count()
  const release=host.holdNext('navigation_effect')
  await composer.fill('恢复超时不能留下问题');await sendButton().click();await release.blocked
  await page.clock.fastForward(21000)
  await frame.getByRole('alert').getByText(/未能恢复这个会话/).waitFor()
  assert.equal(host.requests.filter(r=>r.actionKey==='prepare').length,before)
  assert.equal(await frame.locator('.chat-turn').count(),turnCount)
  assert.equal(await composer.inputValue(),'恢复超时不能留下问题')
  release()
 })
 await check('a waiting timeout is explained once in its own assistant turn',async()=>{
  const datasetId=(await host.service.context(host.scope)).currentDataset.id
  const pending=await host.service.prepare(host.scope,{datasetId,sessionId:firstSession.id,question:'等待提示去重',operationId:randomUUID()})
  host.ageQuestion(pending.queryId)
  await refreshButton().click()
  const turn=frame.locator(`[data-query-id="${pending.queryId}"]`)
  await turn.getByText(/暂未收到分析结果/).waitFor()
  assert.equal(await turn.locator('.turn-notice').count(),1)
  assert.equal(await turn.locator('.turn-error').count(),0)
  await page.clock.fastForward(20000)
  await until(async()=>!(await refreshButton().isDisabled()))
 })
 await check('a late old chat response cannot replace a newly selected conversation',async()=>{
  const release=host.holdNext('data',{operation:'chat',sessionId:firstSession.id})
  await refreshButton().click();await release.blocked
  await frame.getByRole('button',{name:/新建会话/}).click()
  await frame.getByRole('heading',{name:'这次想了解资金的哪一面？'}).waitFor()
  release();await page.waitForTimeout(250)
  assert.equal(await frame.locator('.chat-turn').count(),0)
 })
 await check('a delayed old preview cannot cross a dataset switch',async()=>{
  const release=host.holdNext('data',{operation:'preview'})
  await frame.getByRole('tab',{name:'原始交易'}).click();await release.blocked
  await frame.getByLabel('选择标准交易 Excel').setInputFiles(join(root,'examples/交易明细-同名账户.xlsx'))
  await frame.getByRole('heading',{name:'这次想了解资金的哪一面？'}).waitFor()
  release();await frame.getByRole('tab',{name:'原始交易'}).click()
  await frame.getByText('T006',{exact:true}).waitFor()
  assert.doesNotMatch(await frame.getByRole('row').filter({hasText:'T006'}).innerText(),/赵六/)
  await frame.getByRole('tab',{name:'对话',exact:true}).click()
 })
 let seededRuntime
 await check('older messages paginate chronologically and refreshing does not jump away from reading',async()=>{
  const datasetId=(await host.service.context(host.scope)).currentDataset.id
  const selected=(await host.service.view(host.scope,'chat',{datasetId})).session
  seededRuntime={conversationId:randomUUID(),threadId:randomUUID(),executionId:randomUUID()}
  host.threads.set(seededRuntime.conversationId,{...seededRuntime,messages:[]})
  for(let i=0;i<23;i++){
    const p=await host.service.prepare(host.scope,{datasetId,sessionId:selected.id,question:`历史问题 ${i}`,operationId:randomUUID()})
    await host.service.progress(host.scope,p.queryId,{...seededRuntime,executionId:randomUUID()},'completed',`历史答复 ${i}`)
  }
  await refreshButton().click();await frame.locator('.chat-turn').nth(19).waitFor()
  await frame.getByRole('button',{name:'查看更早的消息'}).click()
  await until(async()=>await frame.locator('.chat-turn').count()===23)
  assert.equal(await frame.locator('.user-message p').first().innerText(),'历史问题 0')
  await frame.locator('.chat-timeline').evaluate(el=>el.scrollTo(0,0));await page.waitForTimeout(100)
  await page.evaluate(()=>window.emitPreviewEvent());await page.waitForTimeout(300)
  assert.equal(await frame.locator('.chat-turn').count(),23)
  assert.ok(await frame.locator('.chat-timeline').evaluate(el=>el.scrollTop<10))
 })
 await check('Shift Enter inserts a newline and Enter sends one complete multiline question',async()=>{
  await composer.fill('张三十月收款');await composer.press('Shift+Enter');await composer.type('请说明统计范围')
  assert.match(await composer.inputValue(),/\n/)
  const count=host.requests.filter(r=>r.actionKey==='prepare').length
  await composer.press('Enter')
  await until(()=>host.requests.filter(r=>r.actionKey==='prepare').length===count+1)
  await frame.locator('.user-message').last().filter({hasText:'请说明统计范围'}).waitFor()
  await until(async()=>await frame.locator('.assistant-progress').count()===0)
  assert.match(await frame.locator('.user-message p').last().innerText(),/\n请说明统计范围/)
 })
 await check('unavailable saved platform conversation is reported without sending into another thread',async()=>{
  host.dropConversation(seededRuntime.conversationId)
  const before=host.requests.filter(r=>r.commandKey==='assistant.chat.send_message').length
  const preparedBefore=host.requests.filter(r=>r.actionKey==='prepare').length
  await composer.fill('继续分析');await sendButton().click()
  await frame.getByRole('alert').getByText(/未能恢复这个会话/).waitFor()
  assert.equal(host.requests.filter(r=>r.commandKey==='assistant.chat.send_message').length,before)
  assert.equal(host.requests.filter(r=>r.actionKey==='prepare').length,preparedBefore)
 })
 assert.deepEqual(errors,[])
 console.log(JSON.stringify({interactionChecks:checks,pythonBacked:true,aiMode:'fixture',realXpertInstalled:false}))
}catch(error){console.error('Page errors:',errors);console.error('Requests:',host.requests);console.error(await page.frames()[1]?.locator('body').innerText().catch(()=>''));await page.screenshot({path:join(root,'test-results/conversation-interaction-failure.png'),fullPage:true});throw error}
finally{await browser.close();await host.close()}
