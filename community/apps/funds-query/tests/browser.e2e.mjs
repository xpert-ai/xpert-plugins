import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import { createPreviewHost } from './preview-host.mjs'
const root=fileURLToPath(new URL('../',import.meta.url)),host=await createPreviewHost()
const browser=await chromium.launch({executablePath:process.env.FUNDS_QUERY_BROWSER||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']})
const page=await browser.newPage({viewport:{width:1440,height:1080}})
page.setDefaultTimeout(20000)
const errors=[];page.on('pageerror',e=>errors.push(e.message))
await mkdir(join(root,'test-results'),{recursive:true})
let checks=0,datasetId,sessionA,sessionB
const firstQuestion='张三在2026年10月一共收了多少钱？'
async function check(name,run){await run();checks++;console.log('PASS',name)}
async function until(test){for(let i=0;i<200;i++){if(await test())return;await page.waitForTimeout(100)}throw Error('Test condition timed out')}
try{
 await page.goto(host.url)
 const frame=page.frameLocator('iframe'),composer=frame.getByLabel('你想了解这批交易的什么？')
 const submit=()=>frame.getByRole('button',{name:'发送消息',exact:true})
 async function send(text){await composer.fill(text);await submit().click();await frame.locator('.user-message').getByText(text,{exact:true}).waitFor()}
 async function settled(){await until(async()=>await frame.locator('.assistant-progress').count()===0&&!(await submit().isDisabled())===Boolean(await composer.inputValue()))}
 async function answer(value){await frame.locator('.answer-amount').last().filter({hasText:value}).waitFor();await until(async()=>await frame.locator('.assistant-progress').count()===0)}
 await check('opaque iframe starts without web storage and uses shared controls',async()=>{
  await frame.getByRole('heading',{name:'让数据回答你的问题'}).waitFor();assert.deepEqual(errors,[])
 })
 await check('invalid XLSX still reports exact rejected rows',async()=>{
  await frame.getByLabel('选择标准交易 Excel').setInputFiles(join(root,'examples/交易明细-错误样例.xlsx'))
  await frame.getByRole('alert').getByText(/发现 3 行错误/).waitFor()
  assert.match(await frame.getByRole('alert').innerText(),/第 3 行/)
  await frame.getByRole('alert').getByRole('button',{name:'关闭'}).click()
 })
 await check('import preserves dataset metrics and creates an empty conversation',async()=>{
  await frame.getByLabel('选择标准交易 Excel').setInputFiles(join(root,'examples/交易明细-标准样例.xlsx'))
  await frame.getByRole('heading',{name:'这次想了解资金的哪一面？'}).waitFor()
  assert.match(await frame.getByLabel('数据集概览').innerText(),/102,566.91/)
  assert.equal(await frame.getByRole('checkbox').count(),0)
  datasetId=(await host.service.context(host.scope)).currentDataset.id
 })
 await check('first question creates a platform thread and renders its actual saved answer',async()=>{
  await send(firstQuestion);await answer('90,000.13')
  await frame.locator('.message-prose').getByText(/90000.13/).waitFor()
  const data=await host.service.view(host.scope,'chat',{datasetId})
  sessionA=data.session
  assert.ok(sessionA.conversationId&&sessionA.threadId)
  assert.equal(data.turns.items[0].replyStatus,'completed')
  assert.equal(host.threads.size,1)
  assert.equal(await frame.locator('.user-message').count(),1)
 })
 await check('natural followup shares the same thread and retains both question-answer pairs',async()=>{
  await send('只看超过5万元的');await answer('60,000.00')
  assert.equal(await frame.locator('.chat-turn').count(),2)
  assert.match(await frame.locator('.answer-amount').first().innerText(),/90,000.13/)
  assert.equal(host.threads.size,1)
  assert.equal(host.threads.get(sessionA.conversationId).messages.length,2)
  assert.equal(host.requests.filter(r=>r.commandKey==='workbench.navigation.open').length,0)
 })
 await page.screenshot({path:join(root,'test-results/conversation.png'),fullPage:true})
 await check('each answer has its own evidence and expandable scope',async()=>{
  const second=frame.locator('.chat-turn').nth(1)
  await second.getByRole('button',{name:'统计范围与口径'}).click()
  assert.match(await second.locator('.analysis-context').innerText(),/> ¥ 50,000.00/)
  await second.getByRole('button',{name:'查看交易依据'}).click()
  await frame.getByRole('dialog').getByText('T005',{exact:true}).waitFor()
  assert.equal(await frame.getByRole('dialog').getByText('T002',{exact:true}).count(),0)
  await frame.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).first().click()
 })
 await check('new conversation resets context while sharing the same dataset',async()=>{
  await frame.getByRole('button',{name:'新建会话',exact:false}).click()
  await frame.getByRole('heading',{name:'这次想了解资金的哪一面？'}).waitFor()
  assert.equal(await frame.locator('.chat-turn').count(),0)
  await send('张三2026年10月全部收款');await answer('90,000.13')
  sessionB=(await host.service.view(host.scope,'chat',{datasetId})).session
  assert.notEqual(sessionA.id,sessionB.id)
  assert.notEqual(sessionA.conversationId,sessionB.conversationId)
  assert.equal(host.threads.size,2)
 })
 await check('reopening an old conversation restores its checkpoint before the next question',async()=>{
  await frame.getByRole('navigation',{name:'会话',exact:true}).getByRole('button',{name:firstQuestion,exact:true}).click()
  await frame.locator('.answer-amount').last().filter({hasText:'60,000.00'}).waitFor()
  await send('全部收款呢');await answer('90,000.13')
  assert.equal(host.threads.size,2)
  assert.equal(host.threads.get(sessionA.conversationId).messages.length,3)
  assert.equal(host.threads.get(sessionB.conversationId).messages.length,1)
 })
 await check('reload restores the selected conversation and the full question-answer timeline',async()=>{
  await page.reload();await frame.locator('.chat-turn').nth(2).waitFor()
  assert.equal(await frame.locator('.user-message').count(),3)
  await frame.locator('.answer-amount').last().filter({hasText:'90,000.13'}).waitFor()
 })
 await check('ranking and trend answers remain inline with the corresponding questions',async()=>{
  await send('谁给他转账最多？');await frame.getByRole('heading',{name:'交易对手排行'}).waitFor()
  await until(async()=>await frame.locator('.assistant-progress').count()===0)
  assert.equal(await frame.locator('.bar-row').count(),3)
  await send('按天显示收款趋势');await frame.getByRole('img',{name:'金额趋势'}).waitFor()
  await until(async()=>await frame.locator('.assistant-progress').count()===0)
  assert.equal(await frame.locator('.chat-turn').count(),5)
 })
 await check('raw transactions do not replace or reset the conversation',async()=>{
  await frame.getByRole('tab',{name:'原始交易'}).click();await frame.getByText('T001',{exact:true}).waitFor()
  await frame.getByRole('tab',{name:'对话',exact:true}).click()
  assert.equal(await frame.locator('.chat-turn').count(),5)
 })
 await check('active processing has visible motion and honors reduced motion',async()=>{
  const release=host.holdNext('analysis')
  await send('再看全部收款')
  await frame.locator('.assistant-progress').last().waitFor()
  const dot=frame.locator('.thinking-dots i').first()
  assert.notEqual(await dot.evaluate(el=>getComputedStyle(el).animationName),'none')
  await page.emulateMedia({reducedMotion:'reduce'})
  assert.equal(await dot.evaluate(el=>getComputedStyle(el).animationName),'none')
  release();await answer('90,000.13');await page.emulateMedia({reducedMotion:'no-preference'})
 })
 await check('same-name account confirmation is a turn inside the same conversation',async()=>{
  await frame.getByLabel('选择标准交易 Excel').setInputFiles(join(root,'examples/交易明细-同名账户.xlsx'))
  await frame.getByRole('heading',{name:'这次想了解资金的哪一面？'}).waitFor()
  await send('张三十月收款')
  await frame.getByRole('button',{name:'使用此账户'}).first().waitFor()
  await until(async()=>await frame.locator('.assistant-progress').count()===0)
  assert.equal(await frame.getByRole('button',{name:'使用此账户'}).count(),2)
  await frame.getByRole('button',{name:'使用此账户'}).first().click();await answer('90,000.13')
  assert.equal(await frame.locator('.chat-turn').count(),2)
 })
 await check('explicit dispatch rejection preserves the question and retry stays in the session',async()=>{
  await page.request.get(host.url+'/fail-next')
  await send('显示收款趋势')
  await frame.getByRole('alert').getByText(/问题未能发送/).waitFor()
  await until(async()=>!(await submit().isDisabled()))
  assert.equal(await composer.inputValue(),'显示收款趋势')
  await submit().click();await frame.getByRole('img',{name:'金额趋势'}).waitFor()
  await until(async()=>await frame.locator('.assistant-progress').count()===0)
 })
 await check('host dark theme is preserved in the chat layout',async()=>{
  await page.evaluate(()=>window.setPreviewTheme('dark'));await page.waitForTimeout(100)
  assert.equal(await page.frames()[1].evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(24, 27, 26)')
  await page.screenshot({path:join(root,'test-results/conversation-dark.png'),fullPage:true})
  await page.evaluate(()=>window.setPreviewTheme('light'))
 })
 await check('mobile composer and conversations fit without horizontal document overflow',async()=>{
  await page.setViewportSize({width:430,height:900});await page.waitForTimeout(100)
  const fits=await page.frames()[1].evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)
  assert.equal(fits,true)
  await frame.getByRole('button',{name:/☰ 会话/}).click()
  await frame.getByRole('dialog').getByRole('button',{name:/新建会话/}).click()
  await frame.getByRole('heading',{name:'这次想了解资金的哪一面？'}).waitFor()
  await frame.getByRole('dialog').waitFor({state:'hidden'})
  await frame.getByRole('button',{name:/☰ 会话/}).click()
  await frame.getByRole('dialog').getByRole('navigation',{name:'会话',exact:true}).getByRole('button',{name:'张三十月收款',exact:true}).click()
  await frame.getByRole('dialog').waitFor({state:'hidden'})
  await frame.getByRole('img',{name:'金额趋势'}).waitFor()
  await page.screenshot({path:join(root,'test-results/conversation-mobile.png'),fullPage:true})
 })
 assert.deepEqual(errors,[])
 console.log(JSON.stringify({browserChecks:checks,pythonBacked:true,aiMode:'fixture',realXpertInstalled:false}))
}catch(error){
 console.error('Page errors:',errors);console.error('Requests:',host.requests)
 console.error(await page.frames()[1]?.locator('body').innerText().catch(()=>''))
 await page.screenshot({path:join(root,'test-results/conversation-failure.png'),fullPage:true});throw error
}finally{await browser.close();await host.close()}
