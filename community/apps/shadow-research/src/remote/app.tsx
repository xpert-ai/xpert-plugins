import React,{useEffect,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {Button,Input,Textarea,Badge,Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from '@xpert-ai/plugin-shadcn-ui'
import {RemoteI18nProvider,useRemoteLocale} from '@xpert-ai/plugin-shadcn-ui/i18n'
import {z} from 'zod/v3'
import {HostBridge} from './bridge.js'
import {i18n,statusKey,roleKey,kindKey} from './i18n.js'
import {snapshotSchema} from '../domain/contracts.js'
import type {Task,TaskStatus,Role} from '../domain/contracts.js'

const bridge=new HostBridge()
bridge.onLocale=locale=>i18n.setLocale(locale)
const receiptSchema=z.object({taskId:z.string(),title:z.string(),status:z.enum(['draft','running','ready','abstained','confirmed','failed']),revision:z.number(),attempt:z.number(),nextRole:z.enum(['fundamental','technical','risk','decision']).nullable(),snapshotKind:z.enum(['historical','live','synthetic']),updatedAt:z.string(),failureCode:z.string().nullable()}).passthrough()
const listSchema=z.object({items:z.array(receiptSchema),total:z.number(),page:z.number(),pageSize:z.number()})
const taskSchema=z.object({id:z.string(),title:z.string(),objective:z.string(),status:z.enum(['draft','running','ready','abstained','confirmed','failed']),revision:z.number(),attempt:z.number(),snapshot:snapshotSchema,snapshotHash:z.string(),failureCode:z.string().nullable(),deadline:z.string().nullable(),
  reviews:z.array(z.object({role:z.enum(['fundamental','technical','risk','decision']),summary:z.string(),risks:z.array(z.string()),candidates:z.array(z.string()),vetoes:z.array(z.string()),selectedCode:z.string().nullable(),evidenceIds:z.array(z.string()),createdAt:z.string()}))}).passthrough()
type VisibleTask=z.infer<typeof taskSchema>
function App(){
  useRemoteLocale(i18n)
  const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
  const [title,setTitle]=useState(''),[objective,setObjective]=useState(''),[snapshot,setSnapshot]=useState('')
  const [list,setList]=useState<z.infer<typeof listSchema>>({items:[],total:0,page:1,pageSize:20})
  const [task,setTask]=useState<VisibleTask|null>(null),[id,setId]=useState(''),[page,setPage]=useState(1)
  const [requestKey,setRequestKey]=useState(crypto.randomUUID())
  const t=i18n.t
  async function reload(){
    // Initial page load restores server records. No browser storage is used in the sandboxed iframe.
    const data=await bridge.query(listSchema,{page:String(page)});setList(data)
    const selected=id||data.items[0]?.taskId
    if(selected){setTask(await bridge.query(taskSchema,{taskId:selected}));if(!id)setId(selected)}
  }
  async function act(fn:()=>Promise<void>){setBusy(true);setMessage('');try{await fn()}catch(e){setMessage(t('error',{code:e instanceof Error?e.message:'unknown'}))}finally{setBusy(false)}}
  useEffect(()=>{let live=true;bridge.connect().then(({locale})=>{if(live){i18n.setLocale(locale);setReady(true);bridge.resize()}}).catch(e=>setMessage(t('error',{code:e.message})));return()=>{live=false}},[])
  useEffect(()=>{if(!ready)return;void act(reload);const timer=setInterval(()=>{void reload().catch(()=>{})},2500);return()=>clearInterval(timer)},[ready,id,page])
  const create=()=>act(async()=>{
    let data:ReturnType<typeof snapshotSchema.parse>
    try{data=snapshotSchema.parse(JSON.parse(snapshot))}catch{throw new Error(t('invalidJson'))}
    const result=await bridge.action('create',{title,objective,snapshot:data,requestKey},receiptSchema)
    setId(result.taskId);setRequestKey(crypto.randomUUID());setMessage(t('created'));await reload()
  })
  const mutate=(key:string)=>act(async()=>{if(!task)return;await bridge.action(key,{taskId:task.id,expectedRevision:task.revision},receiptSchema);await reload()})
  const reference=()=>act(async()=>{
    if(!task)return
    await bridge.appendReferences([{type:'code',path:`research/${task.id}`,label:task.title,
      text:JSON.stringify({taskId:task.id,instruction:t('instruction')}),startLine:1,endLine:1}])
    setMessage(t('referenceHint'))
  })
  const decision=task?.reviews.find(r=>r.role==='decision')
  return <main className="lab font-sans text-foreground bg-background">
    <header className="lab-panel"><h1 className="text-xl font-semibold">{t('title')}</h1><p>{t('subtitle')}</p><p className="text-muted-foreground">{t('frozen')}</p></header>
    {message&&<p role="status">{message}</p>}
    <div className="lab-columns">
      <aside className="lab-panel">
        <section className="lab-panel"><h2 className="font-semibold">{t('newTask')}</h2>
          <div className="lab-fields"><label htmlFor="task-title">{t('taskTitle')}</label><Input id="task-title" value={title} onChange={e=>setTitle(e.target.value)} maxLength={100}/></div>
          <div className="lab-fields"><label htmlFor="task-objective">{t('objective')}</label><Textarea id="task-objective" value={objective} onChange={e=>setObjective(e.target.value)} maxLength={1000}/></div>
          <div className="lab-fields"><label htmlFor="task-snapshot">{t('snapshot')}</label><Textarea id="task-snapshot" className="lab-json" value={snapshot} onChange={e=>setSnapshot(e.target.value)} maxLength={2500000}/></div>
          <p className="text-muted-foreground">{t('snapshotHelp')}</p>
          <Button onClick={create} disabled={!ready||busy||!title||objective.trim().length<5||!snapshot}>{busy?t('busy'):t('create')}</Button>
        </section>
        <section className="lab-panel"><div className="lab-row"><h2>{t('history')}</h2><Button variant="outline" disabled={!ready||busy} onClick={()=>act(reload)}>{t('refresh')}</Button></div>
          {!list.items.length&&<p>{t('empty')}</p>}
          {list.items.map(row=><div className="lab-row" key={row.taskId}><Button variant={row.taskId===id?'secondary':'ghost'} onClick={()=>setId(row.taskId)}>{row.title}</Button><Badge variant="outline">{t(statusKey[row.status])}</Badge></div>)}
          <p>{t('page',{page:list.page,total:list.total})}</p>
          <div className="lab-row"><Button variant="outline" disabled={page<=1||busy} onClick={()=>setPage(page-1)}>{t('previous')}</Button><Button variant="outline" disabled={page*20>=list.total||busy} onClick={()=>setPage(page+1)}>{t('next')}</Button></div>
        </section>
      </aside>
      <section className="lab-panel">{task&&<>
        <div className="lab-row"><h2>{task.title}</h2><Badge>{t(statusKey[task.status])}</Badge><Badge variant="outline">{t(kindKey[task.snapshot.kind])}</Badge></div>
        <p>{task.objective}</p><p>{t('attempt',{attempt:task.attempt})}</p>
        <div className="lab-row">
          {(task.status==='draft'||task.status==='running')&&<Button disabled={busy} onClick={reference}>{t('reference')}</Button>}
          {(task.status==='ready'||task.status==='abstained')&&<Button disabled={busy} onClick={()=>mutate('confirm')}>{t('confirm')}</Button>}
          {task.status==='failed'&&<Button disabled={busy||task.attempt>=3} onClick={()=>mutate('retry')}>{t('retry')}</Button>}
          {task.status==='running'&&<Button variant="outline" disabled={busy||!!task.deadline&&Date.parse(task.deadline)>Date.now()} onClick={()=>mutate('recover')}>{t('recover')}</Button>}
        </div>
        {task.status==='running'&&<p>{t('lease')}</p>}
        {task.failureCode&&<p role="alert">{t('failure')}: {task.failureCode}</p>}
        <div className="lab-row">{(['fundamental','technical','risk','decision'] as Role[]).map(role=><Badge key={role} variant={task.reviews.some(r=>r.role===role)?'default':'outline'}>{t(roleKey[role])}</Badge>)}</div>
        <h3>{t('reviews')}</h3>{!task.reviews.length&&<p>{t('noReviews')}</p>}
        {task.reviews.map(r=><article className="lab-panel" key={r.role}><h4>{t(roleKey[r.role])}</h4><p>{r.summary}</p>
          {r.risks.length>0&&<><h5>{t('risks')}</h5><ul>{r.risks.map((risk,index)=><li key={index}>{risk}</li>)}</ul></>}
          <p className="lab-evidence">{t('evidence')}: {r.evidenceIds.join(', ')}</p>
        </article>)}
        {decision&&<p>{t('selection')}: {decision.selectedCode??t('abstain')}</p>}
        <details><summary>{t('details')}</summary><div className="lab-panel">
          <p>{t('source')}: {task.snapshot.source}</p><p>{t('cutoff')}: {task.snapshot.cutoff}</p><p className="lab-evidence">{t('hash')}: {task.snapshotHash}</p>
          <h3>{t('candidates')}</h3><div className="lab-scroll"><Table><TableHeader><TableRow>{['code','name','price','amount','financial'].map(key=><TableHead key={key}>{t(key as 'code'|'name'|'price'|'amount'|'financial')}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{task.snapshot.stocks.map(row=><TableRow key={row.code}><TableCell>{row.code}</TableCell><TableCell>{row.name}</TableCell><TableCell>{i18n.number(row.price)}</TableCell><TableCell>{i18n.number(row.amount)}</TableCell><TableCell>{t(task.snapshot.financials.some(f=>f.code===row.code)?'available':'missing')}</TableCell></TableRow>)}</TableBody></Table></div>
          <pre className="lab-evidence">{JSON.stringify(task.snapshot.financials,null,2)}</pre>
        </div></details>
      </>}</section>
    </div>
  </main>
}
const root=document.getElementById('root')
if(root)createRoot(root).render(<RemoteI18nProvider i18n={i18n}><App/></RemoteI18nProvider>)
