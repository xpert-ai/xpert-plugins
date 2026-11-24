import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {startPreview} from '../scripts/preview-fixture.mjs'
// Use the bundled Playwright, or install Playwright locally and set PLAYWRIGHT_PACKAGE.
const require=createRequire(import.meta.url)
const playwright=require(process.env.PLAYWRIGHT_PACKAGE??'playwright')
const dir=await mkdtemp(path.join(tmpdir(),'shadow-browser-'))
const host=await startPreview({database:path.join(dir,'preview.sqlite')})
console.log('Preview Host ready')
const browser=await playwright.chromium.launch({channel:'msedge',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:1100}})
const errors=[];page.on('pageerror',e=>errors.push(e.message))
const shots=path.resolve('docs/screenshots');await mkdir(shots,{recursive:true})
const snapshot={source:'Synthetic browser test fixture; not market data',kind:'synthetic',cutoff:'2026-10-23T14:30:00+08:00',
  stocks:[{code:'600000',name:'模拟甲',price:10,amount:100000000,change_pct:2,turnover_pct:3,volume_ratio:1.2,pe_ratio:10,quote_time:'2026-10-23T14:29:00+08:00'}],
  financials:[{code:'600000',source:'Synthetic financials',report_date:'2026-06-30',disclosed_at:'2026-08-01T00:00:00+08:00',revenue_yoy_pct:5,profit_yoy_pct:6,roe_pct:8}]}
async function task(){return (await host.research.list(host.scope)).items[0]}
async function reviews(id){
  await host.research.begin(host.scope,id)
  for(const sortBy of ['amount','change_pct','turnover_pct','pe_ratio'])await host.research.search(host.scope,{taskId:id,sortBy,direction:sortBy==='pe_ratio'?'asc':'desc',offset:0,limit:5})
  await host.research.evidence(host.scope,{taskId:id,code:'600000'})
  for(const role of ['fundamental','technical','risk','decision'])await host.research.submit(host.scope,{taskId:id,role,summary:'浏览器测试的模拟模型结论，仅验证交互与保存。',risks:['模拟数据不代表真实公司'],candidates:['600000'],vetoes:[],selectedCode:role==='decision'?'600000':null,evidenceIds:['snapshot:600000','financial:600000']})
}
try{
  await page.goto(host.url)
  console.log('Browser connected')
  const f=page.frameLocator('#remote-view')
  await f.getByRole('heading',{name:'选股研究实验台',exact:true}).waitFor()
  await page.screenshot({path:path.join(shots,'preview-empty.png'),fullPage:true})
  console.log('Empty state verified')
  await f.getByLabel('任务名称',{exact:true}).fill('演示研究任务')
  await f.getByLabel('研究目标',{exact:true}).fill('比较候选公司的基本面和风险，允许弃选。')
  await f.getByLabel('冻结快照 JSON',{exact:true}).fill('{bad json')
  await f.getByRole('button',{name:'创建任务',exact:true}).click()
  await f.getByRole('status').filter({hasText:'快照 JSON 无效'}).waitFor()
  await page.screenshot({path:path.join(shots,'preview-invalid-input.png'),fullPage:true})
  assert.equal((await host.research.list(host.scope)).total,0)
  console.log('Invalid input rejected')
  await f.getByLabel('冻结快照 JSON',{exact:true}).fill(JSON.stringify(snapshot))
  await f.getByRole('button',{name:'创建任务',exact:true}).click()
  await f.getByRole('button',{name:'引用到聊天研究',exact:true}).waitFor()
  const created=await task();assert.equal(created.status,'draft')
  console.log('Task created')
  await f.getByRole('button',{name:'引用到聊天研究',exact:true}).click()
  await f.getByRole('status').filter({hasText:'任务引用已加入'}).waitFor()
  const hostState=await (await fetch(new URL('/__xpert/remote-view-preview/state',host.url))).json()
  assert.ok(hostState.state.lastReference.references[0].text.includes(created.taskId))
  // Simulated model judgments are injected only by this test, not by the UI or production provider.
  await reviews(created.taskId)
  console.log('Simulated reviews saved')
  await f.getByRole('button',{name:'刷新',exact:true}).click()
  await f.getByRole('button',{name:'确认研究结果',exact:true}).waitFor()
  await page.screenshot({path:path.join(shots,'preview-ready.png'),fullPage:true})
  await f.getByRole('button',{name:'确认研究结果',exact:true}).click()
  await f.getByText('已确认',{exact:true}).first().waitFor()
  assert.equal((await host.research.get(host.scope,created.taskId)).status,'confirmed')
  await page.reload();await f.getByText('已确认',{exact:true}).first().waitFor()
  await page.screenshot({path:path.join(shots,'preview-restored.png'),fullPage:true})
  // Second task: explicit failure, then UI retry must preserve ID/hash and reset to draft.
  await f.getByLabel('任务名称',{exact:true}).fill('失败重试演示')
  await f.getByLabel('研究目标',{exact:true}).fill('演示模型失败之后按原始输入重试。')
  await f.getByLabel('冻结快照 JSON',{exact:true}).fill(JSON.stringify(snapshot))
  await f.getByRole('button',{name:'创建任务',exact:true}).click()
  await f.getByRole('heading',{name:'失败重试演示',exact:true}).waitFor()
  const retryTask=await task();await host.research.begin(host.scope,retryTask.taskId)
  await host.research.fail(host.scope,retryTask.taskId,'model_failed')
  await f.getByRole('button',{name:'刷新',exact:true}).click()
  await f.getByRole('button',{name:'按原快照重试',exact:true}).waitFor()
  await page.screenshot({path:path.join(shots,'preview-failed.png'),fullPage:true})
  await f.getByRole('button',{name:'按原快照重试',exact:true}).click()
  await f.getByRole('button',{name:'引用到聊天研究',exact:true}).waitFor()
  const retried=await host.research.get(host.scope,retryTask.taskId)
  assert.equal(retried.status,'draft');assert.equal(retried.snapshotHash,retryTask.snapshotHash)
  assert.equal((await host.research.list(host.scope)).total,2)
  // Host locale changes must preserve the loaded task and unsaved form text.
  await f.getByLabel('任务名称',{exact:true}).fill('未保存草稿')
  await page.evaluate(()=>window.XpertRemoteViewPreview.updateContext({locale:'en-US'}))
  await f.getByRole('heading',{name:'Stock Research Lab',exact:true}).waitFor()
  assert.equal(await f.getByLabel('Task title',{exact:true}).inputValue(),'未保存草稿')
  assert.deepEqual(errors,[])
  console.log('Browser pass: invalid input, create, chat reference, review, confirm, reload, failure/retry and locale preservation. MODEL=SIMULATED; HOST=PREVIEW.')
  await writeFile('docs/browser-result.json',JSON.stringify({passed:true,host:'official-preview',model:'simulated',database:'sqljs',checks:8},null,2))
}catch(error){console.error('BROWSER TEST FAILED',error);process.exitCode=1}
finally{await Promise.race([browser.close(),new Promise(resolve=>setTimeout(resolve,5000))]);await Promise.race([host.close(),new Promise(resolve=>setTimeout(resolve,3000))]);await rm(dir,{recursive:true,force:true});process.exit(process.exitCode??0)}
