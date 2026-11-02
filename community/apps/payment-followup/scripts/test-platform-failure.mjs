// Requires a dedicated published Xpert Assistant with its own proxy-backed model.
// UI actions and View Host responses are real; only the outbound provider HTTP 503 is injected.
import assert from 'node:assert/strict'
import { readFileSync,writeFileSync,renameSync,mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const env=process.env
const url=env.PAYMENT_FAULT_ASSISTANT_URL
const storage=env.PAYMENT_FAULT_BROWSER_STATE
const control=env.PAYMENT_FAULT_CONTROL
const audit=env.PAYMENT_FAULT_LOG
const evidence=env.PAYMENT_FAULT_EVIDENCE_DIR
if(!url||!storage||!control||!audit||!evidence)throw Error('Set the five PAYMENT_FAULT_* paths/URL described in docs/fault-injection.mdx.')
if(!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw Error('This acceptance runner only targets a local test Xpert.')
const zh=JSON.parse(readFileSync(new URL('../remote/locales/zh-Hans.json',import.meta.url),'utf8'))
const input={customerName:'远帆制造（模型故障验收）',invoiceNumber:'AR-FAULT-'+Date.now(),outstandingCents:400000,
  dueDate:'2026-10-25',communicationDate:'2026-11-01',source:'客户：本笔四千元货款，我们确定在2026年11月5日全额支付。'}
const startedAt=new Date().toISOString()
mkdirSync(evidence,{recursive:true})
function setMode(mode){writeFileSync(control+'.tmp',JSON.stringify({mode})+'\n',{mode:0o600});renameSync(control+'.tmp',control)}
function auditEntries(){try{return readFileSync(audit,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l)).filter(e=>e.at>=startedAt)}catch{return []}}
const browser=await chromium.launch({headless:true,...(env.PLAYWRIGHT_CHANNEL?{channel:env.PLAYWRIGHT_CHANNEL}:{})})
let page
const records=new Map(),created=new Set()
let listing=[]
async function eventually(check,label,timeout=45000){
  const start=Date.now()
  while(Date.now()-start<timeout){const result=await check();if(result)return result;await page.waitForTimeout(250)}
  throw Error('Timed out: '+label)
}
async function workbench(){
  return eventually(async()=>{
    for(const frame of page.frames())if(await frame.getByRole('heading',{name:zh.title,exact:true,level:1}).isVisible().catch(()=>false))return frame
  },'published workbench')
}
try{
  setMode('fail')
  const context=await browser.newContext({storageState:storage,viewport:{width:1800,height:1200}})
  page=await context.newPage()
  page.on('response',async response=>{
    if(!response.url().includes('/views/payment_followup.view__workbench/'))return
    if(!response.url().includes('/data?')&&!response.url().endsWith('/actions/mutate'))return
    const value=await response.json().catch(()=>null)
    if(value?.meta?.selected)records.set(value.meta.selected.id,value.meta.selected)
    if(value?.items)listing=value.items
    if(value?.success&&value.data?.input?.invoiceNumber===input.invoiceNumber){
      records.set(value.data.id,value.data)
      if(value.data.status==='draft')created.add(value.data.id)
    }
  })
  await page.goto(url,{waitUntil:'domcontentloaded'})
  let frame=await workbench()
  await frame.getByRole('button',{name:zh.new,exact:true}).click()
  for(const key of ['customerName','invoiceNumber','dueDate','communicationDate','source'])await frame.locator('#'+key).fill(input[key])
  await frame.locator('#balance').fill('4000')
  await frame.getByRole('button',{name:zh.save,exact:true}).click()
  const recordId=await eventually(()=>[...created][0],'created record')
  const requestAt=Date.now()
  await frame.getByRole('button',{name:zh.analyze,exact:true}).click()
  await eventually(async()=>{
    frame=await workbench()
    return await frame.getByRole('alert').filter({hasText:zh.model_failed}).isVisible().catch(()=>false)
  },'visible model failure (must not wait for the two-minute timeout)')
  const failureLatencyMs=Date.now()-requestAt
  const failed=await eventually(()=>records.get(recordId)?.status==='failed'&&records.get(recordId),'persisted model failure')
  assert.equal(failed.error,'model_failed')
  assert.deepEqual(failed.input,input)
  assert.equal(failed.aiResult,null)
  assert.equal(failed.attempts.length,1)
  assert.ok(auditEntries().some(e=>e.injected===true&&e.status===503&&e.tools.includes('payment_followup_read')))
  console.log('Actual provider HTTP 503 observed; current attempt failed and source preserved in '+failureLatencyMs+' ms.')
  await page.reload({waitUntil:'domcontentloaded'})
  frame=await workbench()
  await frame.getByRole('row').filter({hasText:input.invoiceNumber}).getByRole('button',{name:input.customerName,exact:true}).click()
  await frame.getByRole('alert').filter({hasText:zh.model_failed}).waitFor()
  await page.screenshot({path:join(evidence,'09-model-unavailable.png'),animations:'disabled'})
  assert.equal(created.size,1)
  setMode('pass')
  const restoredAt=new Date().toISOString()
  await frame.getByRole('button',{name:zh.retry,exact:true}).click()
  const reviewed=await eventually(()=>records.get(recordId)?.status==='review'&&records.get(recordId),'real DeepSeek recovery draft',120000)
  frame=await workbench()
  assert.deepEqual(reviewed.input,input)
  assert.notEqual(reviewed.attemptId,failed.attemptId)
  assert.deepEqual(reviewed.attempts.map(a=>a.status),['failed','success'])
  assert.equal(reviewed.aiResult.promises.length,1)
  assert.equal(reviewed.aiResult.promises[0].amountCents,400000)
  assert.equal(reviewed.aiResult.promises[0].paymentDate,'2026-11-05')
  assert.ok(auditEntries().some(e=>e.at>=restoredAt&&e.injected===false&&e.status===200&&e.tools.includes('payment_followup_submit')))
  await frame.locator('#followup').fill('2026-11-02')
  await frame.locator('#note').fill('故障恢复后已核对原文：11月5日全额支付四千元。')
  await frame.getByRole('button',{name:zh.confirm,exact:true}).click()
  const confirmed=await eventually(()=>records.get(recordId)?.status==='confirmed'&&records.get(recordId),'human-confirmed result')
  records.delete(recordId)
  await page.reload({waitUntil:'domcontentloaded'})
  frame=await workbench()
  await frame.getByRole('row').filter({hasText:input.invoiceNumber}).getByRole('button',{name:input.customerName,exact:true}).click()
  await frame.getByRole('heading',{name:zh.confirmedTitle,exact:true}).waitFor()
  const reopened=await eventually(()=>records.get(recordId)?.status==='confirmed'&&records.get(recordId),'confirmed record after full reload')
  assert.deepEqual(reopened.confirmedResult,confirmed.confirmedResult)
  assert.equal(listing.filter(r=>r.invoiceNumber===input.invoiceNumber).length,1)
  assert.equal(created.size,1)
  assert.equal(reopened.attempts.length,2)
  await page.screenshot({path:join(evidence,'10-model-recovered.png'),animations:'disabled'})
  const receipt={scenario:'provider-http-503-then-real-deepseek-recovery',startedAt,completedAt:new Date().toISOString(),failureLatencyMs,
    failureInjected:true,recoveryResponseMocked:false,provider:'deepseek',model:'deepseek-flash',assistantUrl:url,conversationUrl:page.url(),recordId,
    checks:{visibleModelFailure:true,failedStateSurvivesReload:true,inputPreserved:true,sameRecordRetried:true,newAttemptId:true,noDuplicateRecord:true,
      singlePromise:true,humanConfirmationSaved:true,confirmedStateSurvivesReload:true},failed,reviewed,reopened,proxyRequests:auditEntries()}
  writeFileSync(join(evidence,'fault-acceptance-receipt.json'),JSON.stringify(receipt,null,2)+'\n')
  console.log('PASS: HTTP 503 → persisted model_failed → reload → same-record real-model retry → human confirmation → reload, without duplicate records.')
}catch(error){
  if(page){await page.screenshot({path:join(evidence,'fault-debug.png'),animations:'disabled',timeout:10000}).catch(()=>{});console.error('Visible workbench:',await (await workbench()).locator('body').innerText().catch(()=>''))}
  throw error
}finally{
  setMode('pass')
  await browser.close()
}
