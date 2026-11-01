import { test, expect } from '@playwright/test'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const root=process.cwd()
let server, url
const fixture=()=>{
  const channel='xpertai.remote_component',frame=document.querySelector('iframe')
  let query={parameters:{mode:'entry'}}, records=[], next=1, revision=1
  let runtimeScope={projectId:null,conversationId:null}
  window.fixture={records, reads:0, loseNextAction:false, actionCount:0, commands:[], failNavigation:false, failSave:false, holdSession:false, query, runtimeScope}
  const send=(message)=>frame.contentWindow.postMessage({channel,protocolVersion:1,instanceId:'test:real-instance',scopeRevision:revision,...message},'*')
  const init=()=>send({type:'init',locale:'zh-Hans',manifest:{key:'meeting_action_review.views__meeting_action_review.workbench'},initialQuery:query,
    runtimeScope,theme:{mode:'light',cssVars:{'--xui-color-border':'#d4d4d8','--xui-color-primary':'#0f766e'}}})
  window.fixture.echoInit=init
  window.fixture.changeProject=()=>{revision++;runtimeScope={projectId:crypto.randomUUID(),conversationId:null};window.fixture.runtimeScope=runtimeScope;send({type:'hostEvent',event:{type:'view.context.changed',data:{revision,runtimeScope}}})}
  window.addEventListener('message',event=>{
    if(event.source!==frame.contentWindow || event.data.channel!==channel)return
    const m=event.data
    if(m.type==='ready'){init();return}
    if(m.type==='invokeClientCommand'){
      window.fixture.commands.push(m.payload)
      if(m.payload.target==='assistant.execution'){
        if(window.fixture.failNavigation){send({type:'clientCommandResult',requestId:m.requestId,result:{success:false,code:'forbidden'}});return}
        runtimeScope={...runtimeScope,conversationId:m.payload.conversationId};revision++
        window.fixture.runtimeScope=runtimeScope
        // Real host can invalidate the ordinary command ACK while switching context.
        send({type:'hostEvent',event:{type:'view.context.changed',data:{revision,runtimeScope}}});init();return
      }
      query={selectionId:m.payload.selectionId,parameters:m.payload.parameters}
      window.fixture.query=query
      send({type:'clientCommandResult',requestId:m.requestId,result:{success:true,data:{}}});init();return
    }
    if(m.type==='requestData'){
      window.fixture.reads++
      const q=m.query,mode=q.parameters?.mode
      let data
      if(mode==='list')data={items:records.map(r=>({id:r.id,title:r.title,status:r.status,updatedAt:r.updatedAt}))}
      else if(mode==='new')data={meta:{page:'new'}}
      else{
        const r=q.selectionId?records.find(r=>r.id===q.selectionId):records[0]
        if(q.selectionId&&!r){send({type:'error',requestId:m.requestId,code:'NOT_FOUND'});return}
        data=r?{item:r}:{meta:{page:'new'}}
      }
      send({type:'data',requestId:m.requestId,data});return
    }
    if(m.type==='executeAction'){
      window.fixture.actionCount++
      const input=m.input
      let r=records.find(r=>r.id===input.meetingId)
      if(m.actionKey==='create_analysis'){
        r=records.find(r=>r.createOperationId===input.operationId)
        if(!r){
          r={id:`00000000-0000-4000-8000-${String(next++).padStart(12,'0')}`,title:input.title,sourceText:input.sourceText,
            createOperationId:input.operationId,sourceSegments:{segments:[{id:'S001',start:0,end:input.sourceText.length}]},
            items:null,initialItems:null,revision:1,status:'processing',updatedAt:new Date().toISOString(),confirmedAt:null,lastSaveOperationId:null,confirmOperationId:null,
            attempt:{number:1,status:'running',errorCode:null},analysisSession:{state:'pending'}}
          records.unshift(r)
          const target=r
          const release=()=>{target.analysisSession={state:'ready',number:target.attempt.number,conversationId:crypto.randomUUID(),executionId:crypto.randomUUID(),threadId:crypto.randomUUID()}}
          if(window.fixture.holdSession)window.fixture.releaseSession=release
          else release()
          setTimeout(()=>{
            target.status='review_ready';target.revision++
            target.attempt.status='succeeded'
            target.items=[{id:crypto.randomUUID(),task:'整理接口清单',owner:'小李',deadlineText:'周五前',sourceSegmentIds:['S001'],origin:'ai',humanAdjusted:false,reviewNote:null}]
            target.initialItems=structuredClone(target.items)
          },1800)
        }
      }else if(m.actionKey==='save_draft'||m.actionKey==='confirm'){
        if(window.fixture.failSave){send({type:'actionResult',requestId:m.requestId,result:{success:false,data:{code:'VERSION_CONFLICT'}}});return}
        if(r.revision!==input.expectedRevision){send({type:'actionResult',requestId:m.requestId,result:{success:false,data:{code:'VERSION_CONFLICT'}}});return}
        r.items=input.items.map(i=>{const original=r.initialItems.find(x=>x.id===i.id);return {...i,sourceSegmentIds:original?.sourceSegmentIds??[],origin:original?'ai':'manual',humanAdjusted:!!original&&(original.task!==i.task||original.owner!==i.owner||original.deadlineText!==i.deadlineText),reviewNote:original?.reviewNote??null}})
        r.revision++
        if(m.actionKey==='confirm'){r.status='confirmed';r.confirmOperationId=input.operationId;r.confirmedAt=new Date().toISOString()}
        else r.lastSaveOperationId=input.operationId
      }else if(m.actionKey==='retry_analysis'){
        r.status='processing';r.attempt={number:r.attempt.number+1,status:'running',errorCode:null};r.revision++
        r.analysisSession={state:'ready',number:r.attempt.number,conversationId:crypto.randomUUID(),executionId:crypto.randomUUID(),threadId:crypto.randomUUID()}
      }
      if(window.fixture.loseNextAction){window.fixture.loseNextAction=false;return}
      send({type:'actionResult',requestId:m.requestId,result:{success:true,data:r}})
    }
  })
}
test.beforeAll(async()=>{
  const [js,css]=await Promise.all([readFile(resolve(root,'dist/remote/app.js'),'utf8'),readFile(resolve(root,'dist/remote/app.css'),'utf8')])
  server=createServer((req,res)=>{
    res.setHeader('content-type','text/html; charset=utf-8')
    if(req.url==='/frame')res.end(`<!doctype html><html><head><style>${css}</style></head><body><div id="root"></div><script>${js.replaceAll('</script','<\\/script')}</script></body></html>`)
    else res.end(`<!doctype html><html><body style="margin:0"><iframe title="Workbench" sandbox="allow-scripts" src="/frame" style="border:0;width:100vw;height:100vh"></iframe><script>(${fixture.toString()})()</script></body></html>`)
  })
  await new Promise(r=>server.listen(0,'127.0.0.1',r));url=`http://127.0.0.1:${server.address().port}`
})
test.afterAll(async()=>{await new Promise(r=>server.close(r))})
async function start(page){
  await page.addInitScript(()=>{if(window.parent!==window)Object.defineProperty(crypto,'randomUUID',{value:undefined,configurable:true})})
  await page.goto(url)
  const f=page.frameLocator('iframe')
  await f.getByLabel('会议标题',{exact:true}).fill('接口讨论')
  await f.getByLabel('会议原文',{exact:true}).fill('小李周五前整理接口清单。')
  await f.getByRole('button',{name:'提取行动项',exact:true}).click()
  return f
}
test('built workbench updates history while analysis continues, edits, undoes and confirms latest content',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  const f=await start(page)
  await f.getByRole('button',{name:'历史记录',exact:true}).click()
  const row=f.getByRole('button').filter({hasText:'接口讨论'})
  await expect(row).toContainText('待核对',{timeout:10000})
  await row.click()
  await f.getByRole('button',{name:'查看依据',exact:true}).click()
  await expect(f.getByText('小李周五前整理接口清单。',{exact:true})).toBeVisible()
  await f.getByRole('button',{name:'定位原文',exact:true}).click()
  await expect(f.locator('#segment-S001')).toBeVisible()
  await f.getByLabel('负责人',{exact:true}).fill('小王')
  await f.getByRole('button',{name:'移除',exact:true}).click()
  await f.getByRole('button',{name:'撤销最近一次移除',exact:true}).click()
  await expect(f.getByLabel('负责人',{exact:true})).toHaveValue('小王')
  await f.getByRole('button',{name:'保存草稿',exact:true}).click()
  await expect(f.getByText('草稿已保存',{exact:true})).toBeVisible()
  await f.getByLabel('完成时间（原始表达）',{exact:true}).fill('下周一')
  await f.getByRole('button',{name:'确认清单',exact:true}).click()
  await f.getByRole('button',{name:'确认并保存',exact:true}).click()
  await expect(f.getByText('已确认',{exact:true})).toBeVisible()
  await expect(f.getByText('下周一',{exact:true})).toBeVisible()
  await expect(f.getByRole('button',{name:'保存草稿',exact:true})).toHaveCount(0)
  expect(errors).toEqual([])
  expect(await page.evaluate(()=>window.fixture.records.length)).toBe(1)
  const confirmedScreenshot=await f.locator('.workbench').screenshot({path:resolve(root,'test-results/confirmed.png')})
  expect(confirmedScreenshot.length).toBeGreaterThan(5000)
})
test('narrow sandboxed view protects unsaved input and does not overflow',async({page})=>{
  await page.setViewportSize({width:390,height:780});await page.goto(url)
  const f=page.frameLocator('iframe')
  await f.getByLabel('会议标题',{exact:true}).fill('尚未提交')
  await f.getByRole('button',{name:'历史记录',exact:true}).click()
  await expect(f.getByText('当前输入尚未提交，离开将放弃这些内容。')).toBeVisible()
  await expect(f.getByRole('button',{name:'保存并切换'})).toHaveCount(0)
  await f.getByRole('button',{name:'继续编辑',exact:true}).click()
  await expect(f.getByLabel('会议标题',{exact:true})).toHaveValue('尚未提交')
  await expect(f.getByRole('alertdialog')).toHaveCount(0)
  await expect(f.getByLabel('会议标题',{exact:true})).toBeVisible()
  const width=await f.locator('body').evaluate(el=>({scroll:el.scrollWidth,client:el.clientWidth}))
  expect(width.scroll).toBeLessThanOrEqual(width.client)
  const vars=await f.getByLabel('会议标题',{exact:true}).evaluate(el=>({border:getComputedStyle(el).borderTopColor,token:getComputedStyle(el).getPropertyValue('--border').trim()}))
  expect(vars.token).toBe('#d4d4d8');expect(vars.border).toBe('rgb(212, 212, 216)')
  const screenshot = await f.locator('.workbench').screenshot({path:resolve(root,'test-results/narrow.png')})
  expect(screenshot.length).toBeGreaterThan(5000)
})
test('confirmation response loss is verified without repeating confirmation or losing latest edits',async({page})=>{
  test.setTimeout(60000)
  const f=await start(page)
  await expect(f.getByLabel('事项',{exact:true})).toBeVisible({timeout:10000})
  await f.getByLabel('事项',{exact:true}).fill('最新人工修改')
  await f.getByRole('button',{name:'确认清单',exact:true}).click()
  await page.evaluate(()=>{window.fixture.loseNextAction=true})
  await f.getByRole('button',{name:'确认并保存',exact:true}).click()
  await expect(f.getByRole('button',{name:'核实提交结果',exact:true})).toBeVisible({timeout:35000})
  await f.getByRole('button',{name:'核实提交结果',exact:true}).click()
  await expect(f.getByText('已确认',{exact:true})).toBeVisible()
  expect(await page.evaluate(()=>window.fixture.actionCount)).toBe(2)
  await expect(f.getByText('最新人工修改',{exact:true})).toBeVisible()
})

async function addMeeting(f, title) {
  await f.getByRole('button',{name:'新建会议',exact:true}).click()
  await f.getByLabel('会议标题',{exact:true}).fill(title)
  await f.getByLabel('会议原文',{exact:true}).fill('小李周五前整理接口清单。')
  await f.getByRole('button',{name:'提取行动项',exact:true}).click()
  await expect(f.getByRole('heading',{name:title,exact:true})).toBeVisible()
}
const conversation=page=>page.evaluate(()=>window.fixture.runtimeScope.conversationId)
const commands=page=>page.evaluate(()=>window.fixture.commands.filter(c=>c.target==='assistant.execution'))

test('submission and consecutive history selections synchronize exact sessions without extra analysis',async({page})=>{
  const f=await start(page)
  await expect.poll(()=>conversation(page)).not.toBeNull()
  const a=await conversation(page)
  await f.getByRole('button',{name:'新建会议',exact:true}).click()
  expect(await conversation(page)).toBe(a)
  expect(await page.evaluate(()=>window.fixture.actionCount)).toBe(1)
  await f.getByLabel('会议标题',{exact:true}).fill('第二次会议')
  await f.getByLabel('会议原文',{exact:true}).fill('小李周五前整理接口清单。')
  await f.getByRole('button',{name:'提取行动项',exact:true}).click()
  await expect.poll(()=>conversation(page)).not.toBe(a)
  const b=await conversation(page)
  for(const [title,id] of [['接口讨论',a],['第二次会议',b],['接口讨论',a]]){
    await f.getByRole('button',{name:'历史记录',exact:true}).click()
    await f.getByRole('button').filter({hasText:title}).click()
    await expect(f.getByRole('heading',{name:title,exact:true})).toBeVisible()
    await expect.poll(()=>conversation(page)).toBe(id)
  }
  expect(await page.evaluate(()=>window.fixture.actionCount)).toBe(2)
  const payloads=await commands(page)
  expect(payloads.every(p=>p.executionId&&p.threadId&&p.preserveView)).toBe(true)
  const sessionScreenshot=await f.locator('.workbench').screenshot({path:resolve(root,'test-results/session-sync.png')})
  expect(sessionScreenshot.length).toBeGreaterThan(5000)
})

test('unsaved guard retains edits on init echoes, cancel and failed save; successful save precedes navigation',async({page})=>{
  const f=await start(page)
  await expect(f.getByLabel('负责人',{exact:true})).toBeVisible({timeout:10000})
  const initial=await conversation(page), count=(await commands(page)).length
  await f.getByLabel('负责人',{exact:true}).fill('未保存负责人')
  await page.evaluate(()=>window.fixture.echoInit())
  await expect(f.getByLabel('负责人',{exact:true})).toHaveValue('未保存负责人')
  await f.getByRole('button',{name:'新建会议',exact:true}).click()
  await f.getByRole('button',{name:'继续编辑',exact:true}).click()
  await expect(f.getByLabel('负责人',{exact:true})).toHaveValue('未保存负责人')
  await f.getByRole('button',{name:'历史记录',exact:true}).click()
  await page.evaluate(()=>{window.fixture.failSave=true})
  await f.getByRole('button',{name:'保存并切换',exact:true}).click()
  await expect(f.getByRole('alert')).toBeVisible()
  expect(await conversation(page)).toBe(initial)
  expect((await commands(page)).length).toBe(count)
  await expect(f.getByRole('heading',{name:'接口讨论',exact:true})).toBeVisible()
  await page.evaluate(()=>{window.fixture.failSave=false})
  await f.getByRole('button',{name:'历史记录',exact:true}).click()
  await f.getByRole('button',{name:'保存并切换',exact:true}).click()
  await expect(f.getByRole('button').filter({hasText:'接口讨论'})).toBeVisible()
  expect(await page.evaluate(()=>window.fixture.records[0].items[0].owner)).toBe('未保存负责人')
})

test('late session readiness does not steal a newer selection; history opens it when explicitly selected',async({page})=>{
  const f=await start(page)
  await expect.poll(()=>conversation(page)).not.toBeNull()
  const a=await conversation(page)
  await page.evaluate(()=>{window.fixture.holdSession=true})
  await addMeeting(f,'排队会议')
  await expect(f.getByText('正在建立分析会话，左侧暂未同步到本会议。')).toBeVisible()
  await f.getByRole('button',{name:'历史记录',exact:true}).click()
  await f.getByRole('button').filter({hasText:'接口讨论'}).click()
  await expect(f.getByRole('heading',{name:'接口讨论',exact:true})).toBeVisible()
  const n=(await commands(page)).length
  await page.evaluate(()=>window.fixture.releaseSession())
  await expect(f.getByLabel('负责人',{exact:true})).toBeVisible({timeout:10000})
  expect(await conversation(page)).toBe(a)
  expect((await commands(page)).length).toBe(n)
  await f.getByRole('button',{name:'历史记录',exact:true}).click()
  await f.getByRole('button').filter({hasText:'排队会议'}).click()
  await expect.poll(()=>conversation(page)).not.toBe(a)
})

test('navigation rejection can retry without another model action and uses dirty guard',async({page})=>{
  await page.goto(url)
  await page.evaluate(()=>{window.fixture.failNavigation=true})
  const f=page.frameLocator('iframe')
  await f.getByLabel('会议标题',{exact:true}).fill('会话打开失败')
  await f.getByLabel('会议原文',{exact:true}).fill('小李周五前整理接口清单。')
  await f.getByRole('button',{name:'提取行动项',exact:true}).click()
  await expect(f.getByRole('button',{name:'打开分析会话',exact:true})).toBeVisible()
  await expect(f.getByLabel('负责人',{exact:true})).toBeVisible({timeout:10000})
  await f.getByLabel('负责人',{exact:true}).fill('尚未保存')
  await f.getByRole('button',{name:'打开分析会话',exact:true}).click()
  await f.getByRole('button',{name:'继续编辑',exact:true}).click()
  expect(await conversation(page)).toBeNull()
  await f.getByRole('button',{name:'打开分析会话',exact:true}).click()
  await page.evaluate(()=>{window.fixture.failNavigation=false})
  await f.getByRole('button',{name:'放弃修改并切换',exact:true}).click()
  await expect.poll(()=>conversation(page)).not.toBeNull()
  await expect(f.getByLabel('负责人',{exact:true})).toHaveValue('小李')
  expect(await page.evaluate(()=>window.fixture.actionCount)).toBe(1)
})

test('retry switches to the latest attempt; a different project cannot retain dirty editor data',async({page})=>{
  const f=await start(page)
  await expect.poll(()=>conversation(page)).not.toBeNull()
  const a=await conversation(page)
  await expect(f.getByLabel('负责人',{exact:true})).toBeVisible({timeout:10000})
  await page.evaluate(()=>{const r=window.fixture.records[0];r.status='failed';r.attempt.status='failed'})
  await f.getByRole('button',{name:'历史记录',exact:true}).click()
  await f.getByRole('button').filter({hasText:'接口讨论'}).click()
  await f.getByRole('button',{name:'重试提取',exact:true}).click()
  await expect.poll(()=>conversation(page)).not.toBe(a)
  expect(await page.evaluate(()=>window.fixture.records[0].analysisSession.number)).toBe(2)
  await page.evaluate(()=>{window.fixture.records[0].status='review_ready'})
  await expect(f.getByLabel('负责人',{exact:true})).toBeVisible({timeout:10000})
  await f.getByLabel('负责人',{exact:true}).fill('不得跨范围保留')
  await page.evaluate(()=>window.fixture.changeProject())
  await expect(f.getByLabel('负责人',{exact:true})).toHaveValue('小李')
})
