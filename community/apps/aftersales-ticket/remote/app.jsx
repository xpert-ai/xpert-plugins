import React, {useState, useEffect, useRef} from 'react'
import ReactDOM from 'react-dom'
import {Button, Input, Textarea, Label, Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, installShadcnThemeVars} from '@xpert-ai/plugin-shadcn-ui'
import {createRemoteI18n, RemoteI18nProvider, useRemoteLocale} from '@xpert-ai/plugin-shadcn-ui/i18n'
import en from './locales/en.json'
import zh from './locales/zh-Hans.json'
const i18n = createRemoteI18n({en, 'zh-Hans':zh})
const t = i18n.t
const CHANNEL = 'xpertai.remote_component'
let instanceId = null
let scopeRevision = undefined
let sequence = 0
const pending = new Map()
let initialize = () => {}
let refresh = () => {}
function post(type, body = {}) {
  parent.postMessage({channel:CHANNEL, protocolVersion:1, instanceId, scopeRevision, type, ...body}, '*')
}
function request(type, body) {
  if (!instanceId) return Promise.reject(new Error('error'))
  const requestId = String(++sequence)
  return new Promise((resolve,reject) => {
    const timer = setTimeout(() => {pending.delete(requestId); reject(new Error('timeout'))}, 30000)
    pending.set(requestId,{resolve,reject,timer})
    post(type,{requestId,...body})
  })
}
window.addEventListener('message', event => {
  const m = event.data
  if (event.source !== parent || !m || m.channel !== CHANNEL || m.protocolVersion !== 1) return
  if (m.type === 'init' && typeof m.instanceId === 'string') {
    const changed = instanceId !== m.instanceId || scopeRevision !== m.scopeRevision
    if (changed) {
      for(const p of pending.values()) {clearTimeout(p.timer); p.reject(new Error('error'))}
      pending.clear()
    }
    instanceId = m.instanceId
    scopeRevision = m.scopeRevision
    if (typeof m.locale === 'string') i18n.setLocale(m.locale)
    window.XpertRemoteUI?.applyTheme(m.theme)
    initialize(m, changed)
    return
  }
  if (m.instanceId !== instanceId || (m.scopeRevision !== undefined && m.scopeRevision !== scopeRevision)) return
  if (m.type === 'hostEvent') {refresh(); return}
  const p = pending.get(m.requestId)
  if (!p) return
  pending.delete(m.requestId); clearTimeout(p.timer)
  if (m.type === 'error') p.reject(new Error('error'))
  else p.resolve(m.type === 'data' ? m.data : m.result)
})
installShadcnThemeVars()
function App() {
  useRemoteLocale(i18n)
  const [ready,setReady] = useState(false)
  const [items,setItems] = useState([])
  const [total,setTotal] = useState(0)
  const [page,setPage] = useState(1)
  const [busy,setBusy] = useState(false)
  const [notice,setNotice] = useState('')
  const [dialog,setDialog] = useState(null)
  const [title,setTitle] = useState('')
  const [description,setDescription] = useState('')
  const [reply,setReply] = useState('')
  const busyRef = useRef(false)
  const pageRef = useRef(1)
  const loadSequence = useRef(0)
  const active = useRef(true)
  async function load(nextPage = pageRef.current) {
    const seq = ++loadSequence.current
    const scope = instanceId
    const data = await request('requestData',{query:{page:nextPage,pageSize:20}})
    if (!active.current || seq !== loadSequence.current || scope !== instanceId) return
    setItems(Array.isArray(data?.items) ? data.items : [])
    setTotal(data?.total ?? 0); pageRef.current=nextPage; setPage(nextPage)
  }
  async function run(operation) {
    if(busyRef.current) return
    const generation = instanceId + ':' + scopeRevision
    busyRef.current=true; setBusy(true); setNotice('')
    try {await operation()} catch(error) {if(active.current && generation === instanceId + ':' + scopeRevision)setNotice(error.message==='timeout'?'timeout':'error')}
    finally {if(generation === instanceId + ':' + scopeRevision){busyRef.current=false; if(active.current)setBusy(false)}}
  }
  useEffect(() => {
    active.current=true
    initialize = (_message, changed) => {
      setReady(true)
      if(changed) {busyRef.current=false;setBusy(false);setNotice('');setItems([]); setTotal(0); setDialog(null);setTitle('');setDescription('');setReply('');pageRef.current=1;void run(()=>load(1))}
    }
    refresh=()=>{if(!busyRef.current)void run(()=>load())}
    post('ready')
    return()=>{active.current=false;initialize=()=>{};refresh=()=>{}}
  },[])
  useEffect(()=>{post('resize',{height:Math.max(document.body.scrollHeight,560)})},[items,notice,dialog])
  async function action(key, targetId, input) {
    const result=await request('executeAction',{actionKey:key,targetId,input})
    if(!result?.success) throw new Error('error')
    return result
  }
  function openCreate() {setTitle('');setDescription('');setDialog({mode:'create',commandId:crypto.randomUUID()})}
  function openReview(ticket) {setReply(ticket.reply);setDialog({mode:'review',ticket})}
  async function submit() {
    const current=dialog
    await run(async()=>{
      if(current.mode==='create') await action('create',undefined,{title,description,commandId:current.commandId})
      if(current.mode==='review') await action('confirm',current.ticket.id,{attempt:current.ticket.attempt,reply})
      if(current.mode==='interrupt') await action('interrupt',current.ticket.id,{attempt:current.ticket.attempt})
      setDialog(null);setNotice('saved');await load(current.mode==='create'?1:pageRef.current)
    })
  }
  async function analyze(ticket) {
    await run(async()=>{
      const result=await request('invokeClientCommand',{commandKey:'assistant.chat.send_message',payload:{text:t('analyzePrompt',{id:ticket.id})}})
      if(result?.success===false) throw new Error('error')
      setDialog(null);setNotice('sent');await load()
    })
  }
  const selected=dialog?.ticket
  return <main style={{padding:16,display:'grid',gap:16}}>
    <header><h2>{t('title')}</h2><p>{t('help')}</p></header>
    <div style={{display:'flex',gap:8}}><Button disabled={!ready||busy} onClick={openCreate}>{t('new')}</Button><Button variant="outline" disabled={!ready||busy} onClick={()=>run(()=>load())}>{t('refresh')}</Button></div>
    {notice&&<p role="status">{t(notice)}</p>}
    {!ready&&<p>{t('loading')}</p>}
    <Table><TableHeader><TableRow><TableHead>{t('subject')}</TableHead><TableHead>{t('status')}</TableHead><TableHead>{t('created')}</TableHead><TableHead>{t('open')}</TableHead></TableRow></TableHeader>
      <TableBody>{items.map(ticket=><TableRow key={ticket.id}><TableCell>{ticket.title}</TableCell><TableCell>{t(ticket.status)}</TableCell><TableCell>{i18n.date(ticket.createdAt,{dateStyle:'short',timeStyle:'short'})}</TableCell><TableCell><Button variant="outline" disabled={busy} onClick={()=>setDialog({mode:'detail',ticket})}>{t('open')}</Button></TableCell></TableRow>)}</TableBody></Table>
    {ready&&!items.length&&<p>{t('empty')}</p>}
    <div style={{display:'flex',alignItems:'center',gap:8}}><Button variant="outline" disabled={busy||page<=1} onClick={()=>run(()=>load(page-1))}>{t('previous')}</Button><span>{t('page',{page,total})}</span><Button variant="outline" disabled={busy||page*20>=total} onClick={()=>run(()=>load(page+1))}>{t('next')}</Button></div>
    <Dialog open={!!dialog} onOpenChange={open=>{if(!open&&!busy)setDialog(null)}}><DialogContent style={{maxHeight:'90vh',overflowY:'auto'}}>
      <DialogHeader><DialogTitle>{t(dialog?.mode==='create'?'new':dialog?.mode==='review'?'review':dialog?.mode==='interrupt'?'interrupt':'open')}</DialogTitle><DialogDescription>{t(dialog?.mode==='interrupt'?'interruptHelp':'help')}</DialogDescription></DialogHeader>
      {dialog?.mode==='create'&&<><Label htmlFor="ticket-title">{t('subject')}</Label><Input id="ticket-title" maxLength={160} value={title} disabled={busy} onChange={e=>setTitle(e.target.value)}/><Label htmlFor="ticket-description">{t('issue')}</Label><Textarea id="ticket-description" maxLength={12000} value={description} disabled={busy} onChange={e=>setDescription(e.target.value)}/></>}
      {selected&&<><h3>{selected.title}</h3><p style={{whiteSpace:'pre-wrap'}}>{selected.description}</p><p>{t(selected.status)} · {t('version',{attempt:selected.attempt})}</p></>}
      {selected?.analysis&&<><p>{t('category')}: {t(selected.analysis.category)} · {t('priority')}: {t(selected.analysis.priority)}</p><p>{t('questions')}: {selected.analysis.questions.join(' / ')||t('none')}</p></>}
      {dialog?.mode==='detail'&&selected?.reply&&<p style={{whiteSpace:'pre-wrap'}}>{selected.reply}</p>}
      {dialog?.mode==='review'&&<><Label htmlFor="ticket-reply">{t('reply')}</Label><Textarea id="ticket-reply" maxLength={12000} value={reply} disabled={busy} onChange={e=>setReply(e.target.value)}/></>}
      {notice&&<p role="status">{t(notice)}</p>}
      <DialogFooter>
        <Button variant="outline" disabled={busy} onClick={()=>setDialog(null)}>{t('cancel')}</Button>
        {dialog?.mode==='create'&&<Button disabled={busy||!title.trim()||!description.trim()} onClick={submit}>{t('save')}</Button>}
        {dialog?.mode==='review'&&<Button disabled={busy||!reply.trim()} onClick={submit}>{t('confirm')}</Button>}
        {dialog?.mode==='interrupt'&&<Button disabled={busy} onClick={submit}>{t('interrupt')}</Button>}
        {dialog?.mode==='detail'&&['draft','analysis_failed'].includes(selected.status)&&<Button disabled={busy} onClick={()=>analyze(selected)}>{t('analyze')}</Button>}
        {dialog?.mode==='detail'&&selected.status==='awaiting_review'&&<Button disabled={busy} onClick={()=>openReview(selected)}>{t('review')}</Button>}
        {dialog?.mode==='detail'&&selected.status==='analyzing'&&<Button disabled={busy} onClick={()=>setDialog({mode:'interrupt',ticket:selected})}>{t('interrupt')}</Button>}
      </DialogFooter>
    </DialogContent></Dialog>
  </main>
}
ReactDOM.render(<RemoteI18nProvider i18n={i18n}><App/></RemoteI18nProvider>,document.getElementById('root'))