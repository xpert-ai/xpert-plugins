import { Badge } from '@candidate-ui/badge.js'
import { Button } from '@candidate-ui/button.js'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@candidate-ui/card.js'
import { Input } from '@candidate-ui/input.js'
import { Textarea } from '@candidate-ui/textarea.js'
import { connect, executeAction, invokeClientCommand, isRecord, readString, requestData, resize } from './bridge.js'
import { React, ReactDOM } from './vendor.js'

interface Job { id: string; companyName: string; roleName: string; questions?: Array<{ id: string; label: string; required: boolean }> }
interface Application { id: string; jobId: string; status: string; candidateName: string; contact: string; updatedAt: string }
interface Finding { criterion: string; status: string; evidence?: string; explanation: string }
interface Detail extends Application {
  profile?: Record<string, unknown>
  resumeText?: string
  screeningResult?: { summary: string; requiredFindings: Finding[]; preferredFindings: Finding[]; strengths: string[]; concerns: string[]; followUpQuestions: string[] }
  screeningError?: string
  hrDecision?: string
  hrNote?: string
  job?: Job & { roleDescription: string; requiredCriteria: string[]; preferredCriteria: string[] }
}
interface WorkbenchData { jobs: Job[]; applications: Application[]; selected: Detail | null }

const { useCallback, useEffect, useMemo, useState } = React
const STATUS: Record<string, string> = { invited: '待填写', draft: '填写中', submitted: '已提交', screening: '分析中', pending_review: '待人工确认', confirmed: '已确认', parse_failed: 'PDF 解析失败', screening_failed: 'AI 初筛失败', expired: '已过期' }

function App() {
  const [ready, setReady] = useState(false)
  const [data, setData] = useState<WorkbenchData>({ jobs: [], applications: [], selected: null })
  const [selectedId, setSelectedId] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [createMode, setCreateMode] = useState(false)
  const [invitation, setInvitation] = useState('')

  const load = useCallback(async (id?: string) => {
    try {
      const message = await requestData(id)
      const item = unwrapData(message)
      setData(item)
      setSelectedId(id ?? item.selected?.id)
      setNotice('')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '加载失败')
    }
  }, [])

  useEffect(() => connect(() => { setReady(true); void load() }, () => void load(selectedId)), [load, selectedId])
  useEffect(() => { setTimeout(resize, 0) }, [data, createMode, notice])

  async function run(action: string, input: Record<string, unknown>) {
    setBusy(true); setNotice('')
    try {
      const message = await executeAction(action, input)
      const result = unwrapAction(message)
      if (!result.success) throw new Error(readMessage(result.message) ?? '操作失败')
      await load(selectedId)
      return isRecord(result.data) ? result.data : undefined
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '操作失败')
      return undefined
    } finally { setBusy(false) }
  }

  async function createJob(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget)
    const questions = String(form.get('questions') ?? '').split(/\r?\n/).map(value => value.trim()).filter(Boolean).map((value, index) => ({
      id: `question_${Date.now()}_${index}`,
      label: value.replace(/^\*\s*/, ''),
      required: value.startsWith('*')
    }))
    const result = await run('create_job', {
      companyName: form.get('companyName'), roleName: form.get('roleName'), roleDescription: form.get('roleDescription'),
      requiredCriteria: String(form.get('requiredCriteria') ?? '').split(/\r?\n/).filter(Boolean),
      preferredCriteria: String(form.get('preferredCriteria') ?? '').split(/\r?\n/).filter(Boolean), questions, defaultExpiryDays: 7
    })
    if (result) setCreateMode(false)
  }

  async function createInvitation(jobId: string) {
    const result = await run('create_invitation', { jobId, expiryDays: 7 })
    const path = readString(result?.path)
    if (path) {
      const url = new URL(path, window.location.origin).toString(); setInvitation(url)
      await navigator.clipboard?.writeText(url).catch(() => undefined)
      setNotice('邀请链接已生成并复制。')
    }
  }

  async function startScreening() {
    if (!data.selected) return
    const result = await run('start_screening', { applicationId: data.selected.id })
    const commandKey = readString(result?.commandKey)
    const payload = isRecord(result?.payload) ? result.payload : undefined
    if (commandKey && payload) await invokeClientCommand(commandKey, payload)
  }

  const grouped = useMemo(() => new Map(data.jobs.map(job => [job.id, job])), [data.jobs])
  if (!ready) return <main className="ci-loading">正在连接候选人工作台…</main>
  return <main className="ci-shell">
    <header className="ci-header"><div><p className="ci-kicker">RECRUITING OPERATIONS</p><h1>候选人招聘登记</h1><p>邀请候选人提交材料，由 Agent 初筛，再由 HR 作最终确认。</p></div><Button onClick={() => setCreateMode(value => !value)}>新建岗位</Button></header>
    {notice && <div className="ci-notice">{notice}</div>}{invitation && <div className="ci-link"><strong>候选人链接</strong><Input readOnly value={invitation}/><Button variant="outline" onClick={() => navigator.clipboard?.writeText(invitation)}>复制</Button></div>}
    {createMode && <Card className="ci-create"><CardHeader><CardTitle>新建招聘岗位</CardTitle><CardDescription>必需条件和加分条件只供 Agent 与 HR 使用，不会显示给候选人。</CardDescription></CardHeader><CardContent><form className="ci-form" onSubmit={createJob}><Input name="companyName" placeholder="公司名称" required/><Input name="roleName" placeholder="面试岗位" required/><Textarea name="roleDescription" placeholder="岗位介绍（候选人可见）" required/><Textarea name="requiredCriteria" placeholder={'必需条件，每行一条'} required/><Textarea name="preferredCriteria" placeholder={'加分条件，每行一条'}/><Textarea name="questions" placeholder={'候选人补充问题，每行一题；必答题以 * 开头'}/><Button disabled={busy} type="submit">保存岗位</Button></form></CardContent></Card>}
    <section className="ci-layout"><aside className="ci-sidebar"><div className="ci-section-title"><h2>岗位与邀请</h2><span>{data.applications.length}</span></div>{data.jobs.length===0?<p className="ci-empty">先创建一个岗位。</p>:data.jobs.map(job=><Card key={job.id} className="ci-job"><CardHeader><CardTitle>{job.roleName}</CardTitle><CardDescription>{job.companyName}</CardDescription></CardHeader><CardContent><Button variant="outline" size="sm" onClick={()=>void createInvitation(job.id)}>生成候选人链接</Button></CardContent></Card>)}<div className="ci-section-title"><h2>候选人</h2></div>{data.applications.map(app=><button key={app.id} className={'ci-candidate '+(app.id===selectedId?'active':'')} onClick={()=>{setSelectedId(app.id);void load(app.id)}}><span><strong>{app.candidateName}</strong><small>{grouped.get(app.jobId)?.roleName ?? '岗位'} · {app.contact || '未填写联系方式'}</small></span><Badge variant="secondary">{STATUS[app.status]??app.status}</Badge></button>)}</aside>
    <section className="ci-main">{data.selected?<DetailPanel detail={data.selected} busy={busy} startScreening={startScreening} run={run}/>:<div className="ci-empty-state"><h2>选择一位候选人</h2><p>查看提交信息、Agent 初筛证据和人工决定。</p></div>}</section></section>
  </main>
}

function DetailPanel({ detail, busy, startScreening, run }: {detail: Detail; busy: boolean; startScreening: ()=>Promise<void>; run: (action:string,input:Record<string,unknown>)=>Promise<Record<string,unknown>|undefined>}) {
  const profile = detail.profile ?? {}
  return <div className="ci-detail"><div className="ci-detail-head"><div><Badge>{STATUS[detail.status]??detail.status}</Badge><h2>{detail.candidateName}</h2><p>{detail.job?.companyName} · {detail.job?.roleName}</p></div><div className="ci-actions">{['submitted','screening_failed','pending_review'].includes(detail.status)&&<Button disabled={busy} onClick={()=>void startScreening()}>{detail.status==='screening_failed'?'重试 Agent 初筛':'运行 Agent 初筛'}</Button>}<Button variant="outline" disabled={busy} onClick={()=>void run('reopen_application',{applicationId:detail.id})}>重新开放</Button></div></div>
    <div className="ci-grid"><Card><CardHeader><CardTitle>候选人信息</CardTitle></CardHeader><CardContent><Info label="联系方式" value={detail.contact}/><Info label="所在城市" value={readString(profile.currentCity)}/><Info label="候选人身份" value={identityLabel(readString(profile.identity))}/><Info label="工作年限" value={workYearsLabel(readString(profile.workYears))}/><Info label="最高学历" value={readString(profile.highestDegree)}/><Info label="最早到岗" value={readString(profile.earliestAvailability)}/><Info label="专业技能" value={readList(profile.skills).join('、')}/><Info label="能力简述" value={readString(profile.abilitySummary)}/></CardContent></Card><Card><CardHeader><CardTitle>岗位标准</CardTitle><CardDescription>候选人不可见</CardDescription></CardHeader><CardContent><h4>必需条件</h4><List values={detail.job?.requiredCriteria}/><h4>加分条件</h4><List values={detail.job?.preferredCriteria}/></CardContent></Card></div>
    <ProfileRecords profile={profile} job={detail.job}/>
    {detail.resumeText&&<Card><CardHeader><CardTitle>PDF 简历提取文本</CardTitle><CardDescription>用于核对结构化信息和 Agent 证据。</CardDescription></CardHeader><CardContent><pre className="ci-resume">{detail.resumeText}</pre></CardContent></Card>}
    <Card><CardHeader><CardTitle>Agent 初筛</CardTitle><CardDescription>仅作为招聘辅助，最终决定由 HR 作出。</CardDescription></CardHeader><CardContent>{detail.screeningError&&<p className="ci-error">{detail.screeningError}</p>}{detail.screeningResult?<><p>{detail.screeningResult.summary}</p><FindingList title="必需条件" values={detail.screeningResult.requiredFindings}/><FindingList title="加分条件" values={detail.screeningResult.preferredFindings}/><div className="ci-grid"><div><h4>优势</h4><List values={detail.screeningResult.strengths}/></div><div><h4>待确认</h4><List values={[...detail.screeningResult.concerns,...detail.screeningResult.followUpQuestions]}/></div></div><Decision detail={detail} busy={busy} run={run}/></>:<p className="ci-empty">尚未生成初筛结果。</p>}</CardContent></Card>
  </div>
}

function Decision({detail,busy,run}:{detail:Detail;busy:boolean;run:(action:string,input:Record<string,unknown>)=>Promise<Record<string,unknown>|undefined>}) { const [decision,setDecision]=useState('advance');const [note,setNote]=useState('');return <div className="ci-decision"><h4>HR 人工确认</h4><select value={decision} onChange={e=>setDecision(e.target.value)}><option value="advance">推进面试</option><option value="request_information">待补充信息</option><option value="reject">暂不推进</option></select><Textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="人工备注（可选）"/><Button disabled={busy||detail.status!=='pending_review'} onClick={()=>void run('confirm_decision',{applicationId:detail.id,decision,note})}>确认决定</Button></div> }
function Info({label,value}:{label:string;value?:string}) { return <div className="ci-info"><span>{label}</span><strong>{value||'未填写'}</strong></div> }
function List({values}:{values?:string[]}) { return values?.length?<ul>{values.map((v,i)=><li key={i}>{v}</li>)}</ul>:<p className="ci-empty">无</p> }
function FindingList({title,values}:{title:string;values:Finding[]}) { return <div><h4>{title}</h4>{values.map((v,i)=><div className="ci-finding" key={i}><Badge variant="outline">{{met:'符合',partially_met:'部分符合',not_evidenced:'资料未体现'}[v.status]??v.status}</Badge><div><strong>{v.criterion}</strong><p>{v.explanation}</p>{v.evidence&&<small>证据：{v.evidence}</small>}</div></div>)}</div> }
function ProfileRecords({profile,job}:{profile:Record<string,unknown>;job?:Detail['job']}) { const education=readRecords(profile.education);const experiences=readRecords(profile.experiences);const projects=readRecords(profile.projects);const answers=isRecord(profile.answers)?profile.answers:{};return <Card><CardHeader><CardTitle>履历详情</CardTitle></CardHeader><CardContent><div className="ci-grid"><RecordList title="教育经历" values={education} render={item=>[readString(item.school),readString(item.major),readString(item.degree),dateRange(item)].filter(Boolean).join(' · ')}/><RecordList title="工作经历" values={experiences} render={item=>[readString(item.company),readString(item.title),dateRange(item),readString(item.description)].filter(Boolean).join(' · ')}/><RecordList title="项目经历" values={projects} render={item=>[readString(item.name),readString(item.role),readString(item.description)].filter(Boolean).join(' · ')}/><div><h4>证书与作品</h4><List values={[...readList(profile.certificates),...(readString(profile.portfolioUrl)?[readString(profile.portfolioUrl)!]:[])]}/></div></div>{job?.questions?.length?<div><h4>岗位补充回答</h4>{job.questions.map(question=><Info key={question.id} label={question.label} value={readString(answers[question.id])}/>)}</div>:null}</CardContent></Card> }
function RecordList({title,values,render}:{title:string;values:Record<string,unknown>[];render:(item:Record<string,unknown>)=>string}) { return <div><h4>{title}</h4>{values.length?<div className="ci-records">{values.map((item,index)=><p className="ci-record" key={readString(item.id)??index}>{render(item)}</p>)}</div>:<p className="ci-empty">无</p>}</div> }

function unwrapData(message: Record<string, unknown>): WorkbenchData { const data=isRecord(message.data)?message.data:{};const item=isRecord(data.item)?data.item:data;return {jobs:Array.isArray(item.jobs)?item.jobs as Job[]:[],applications:Array.isArray(item.applications)?item.applications as Application[]:[],selected:isRecord(item.selected)?item.selected as unknown as Detail:null} }
function unwrapAction(message: Record<string, unknown>): { success?: boolean; message?: unknown; data?: unknown } {
  return isRecord(message.result) ? message.result : {}
}
function readMessage(value: unknown){if(typeof value==='string')return value;if(isRecord(value))return readString(value.zh_Hans)??readString(value.en_US);return undefined}
function readList(value:unknown){return Array.isArray(value)?value.filter((item):item is string=>typeof item==='string'&&Boolean(item.trim())):[]}
function readRecords(value:unknown){return Array.isArray(value)?value.filter(isRecord):[]}
function dateRange(item:Record<string,unknown>){return [readString(item.startDate),readString(item.endDate)].filter(Boolean).join(' – ')}
function identityLabel(value?:string){return ({intern_student:'在校生/实习生',fresh_graduate:'应届毕业生',experienced:'社会招聘'} as Record<string,string>)[value??'']??value}
function workYearsLabel(value?:string){return ({none:'无工作经验',lt_1:'0–1 年','1_3':'1–3 年','3_5':'3–5 年','5_10':'5–10 年','10_plus':'10 年以上'} as Record<string,string>)[value??'']??value}

const style=document.createElement('style');style.textContent=`:root{--background:0 0% 100%;--foreground:222 33% 12%;--card:0 0% 100%;--muted:216 25% 96%;--muted-foreground:218 11% 44%;--border:216 20% 88%;--primary:#1d4ed8;--primary-foreground:#fff}*{box-sizing:border-box}body{margin:0;background:hsl(var(--background));color:hsl(var(--foreground));font-family:Inter,"PingFang SC",sans-serif}[data-slot=button]{display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:7px 12px;border:1px solid transparent;border-radius:8px;background:var(--primary);color:var(--primary-foreground);font:inherit;font-size:13px;font-weight:650;cursor:pointer}[data-slot=button][data-variant=outline]{border-color:hsl(var(--border));background:white;color:hsl(var(--foreground))}[data-slot=button]:disabled{cursor:not-allowed;opacity:.5}[data-slot=card]{display:flex;flex-direction:column;gap:12px;padding:16px;border:1px solid hsl(var(--border));border-radius:14px;background:hsl(var(--card));box-shadow:0 5px 18px #1720330a}[data-slot=card-header],[data-slot=card-content]{display:grid;gap:4px}[data-slot=card-title]{font-size:16px;font-weight:700}[data-slot=card-description]{font-size:13px;color:hsl(var(--muted-foreground))}[data-slot=input],[data-slot=textarea]{width:100%;border:1px solid hsl(var(--border));border-radius:8px;padding:9px 11px;background:white;color:inherit;font:inherit}[data-slot=textarea]{min-height:86px;resize:vertical}[data-slot=badge]{display:inline-flex;width:max-content;padding:3px 7px;border:1px solid hsl(var(--border));border-radius:999px;background:hsl(var(--muted));font-size:11px;font-weight:650}.ci-shell{padding:24px;min-height:720px}.ci-loading,.ci-empty-state{display:grid;place-items:center;min-height:600px;color:hsl(var(--muted-foreground))}.ci-header{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;padding:26px 28px;border-radius:18px;color:white;background:linear-gradient(135deg,#173b6c,#27649a);box-shadow:0 16px 36px #173b6c22}.ci-header h1{margin:4px 0;font-size:28px}.ci-header p{margin:0;color:#dbeafe}.ci-kicker{font-size:11px!important;letter-spacing:.16em;color:#93c5fd!important}.ci-layout{display:grid;grid-template-columns:330px minmax(0,1fr);gap:18px;margin-top:18px}.ci-sidebar{display:grid;align-content:start;gap:10px}.ci-main{min-width:0}.ci-section-title{display:flex;justify-content:space-between;align-items:center;margin-top:8px}.ci-section-title h2{font-size:15px;margin:0}.ci-job h3{font-size:15px}.ci-candidate{width:100%;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px;border:1px solid hsl(var(--border));border-radius:11px;background:hsl(var(--card));text-align:left;color:inherit}.ci-candidate.active{border-color:#2563eb;box-shadow:0 0 0 2px #bfdbfe}.ci-candidate span{display:grid;gap:3px;min-width:0}.ci-candidate small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:hsl(var(--muted-foreground))}.ci-detail{display:grid;gap:16px}.ci-detail-head{display:flex;justify-content:space-between;align-items:flex-start;padding:4px}.ci-detail-head h2{margin:8px 0 2px}.ci-detail-head p{margin:0;color:hsl(var(--muted-foreground))}.ci-actions{display:flex;gap:8px}.ci-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.ci-info{display:grid;grid-template-columns:90px 1fr;gap:10px;padding:8px 0;border-bottom:1px solid hsl(var(--border));font-size:14px}.ci-info span{color:hsl(var(--muted-foreground))}.ci-finding{display:grid;grid-template-columns:auto 1fr;gap:12px;padding:13px 0;border-bottom:1px solid hsl(var(--border))}.ci-finding p{margin:3px 0}.ci-finding small{color:hsl(var(--muted-foreground))}.ci-form,.ci-decision{display:grid;gap:12px}.ci-form{grid-template-columns:repeat(2,minmax(0,1fr))}.ci-form textarea{grid-column:1/-1}.ci-create,.ci-notice,.ci-link{margin-top:16px}.ci-notice,.ci-link{padding:12px 14px;border:1px solid #bfdbfe;border-radius:11px;background:#eff6ff;color:#1e40af}.ci-link{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center}.ci-error{color:#b42318}.ci-empty{color:hsl(var(--muted-foreground));font-size:14px}.ci-record{margin:0 0 8px;padding:10px;border-radius:8px;background:hsl(var(--muted));font-size:13px;line-height:1.55}.ci-resume{max-height:320px;overflow:auto;white-space:pre-wrap;font:12px/1.65 ui-monospace,monospace;color:#344054;background:#f8fafc;border-radius:10px;padding:14px}select{height:40px;border:1px solid hsl(var(--border));border-radius:8px;background:hsl(var(--background));padding:0 10px}@media(max-width:900px){.ci-layout,.ci-grid{grid-template-columns:1fr}.ci-header,.ci-detail-head{align-items:stretch;flex-direction:column}.ci-form{grid-template-columns:1fr}.ci-form textarea{grid-column:auto}.ci-link{grid-template-columns:1fr}}`;document.head.appendChild(style)

const rootElement=document.getElementById('root');const root=ReactDOM.createRoot?.(rootElement);if(root)root.render(<App/>);else ReactDOM.render?.(<App/>,rootElement)
