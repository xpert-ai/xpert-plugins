import { createHash, randomUUID } from 'node:crypto'
import { ROLES } from '../constants.js'
import { ResearchError, createSchema, searchSchema, reviewSchema, evidenceSchema, scopeSchema } from './contracts.js'
import type { Scope, Task } from './contracts.js'

export interface TaskStore {
  get(scope: Scope, id: string): Promise<Task | null>
  findRequest(scope: Scope, requestKey: string): Promise<Task | null>
  insert(scope: Scope, task: Task): Promise<void>
  replace(scope: Scope, task: Task, expectedRevision: number): Promise<void>
  list(scope: Scope, offset: number, limit: number): Promise<{items: Task[]; total: number}>
}
export class Research {
  constructor(private readonly store: TaskStore, private readonly clock = () => new Date()) {}
  private now() { return this.clock().toISOString() }
  async get(scope: Scope, id: string) {
    scopeSchema.parse(scope)
    const task = await this.store.get(scope, id)
    if (!task) throw new ResearchError('not_found')
    return task
  }
  async list(scope: Scope, page = 1) {
    scopeSchema.parse(scope)
    if (!Number.isInteger(page) || page < 1 || page > 10000) throw new ResearchError('invalid_page')
    const result = await this.store.list(scope, (page - 1) * 20, 20)
    return {page, pageSize:20, total:result.total, items:result.items.map(t => this.receipt(t))}
  }
  receipt(t: Task) {
    return {taskId:t.id, title:t.title, status:t.status, revision:t.revision, attempt:t.attempt,
      nextRole:ROLES[t.reviews.length] ?? null, snapshotHash:t.snapshotHash, snapshotKind:t.snapshot.kind,
      updatedAt:t.updatedAt, failureCode:t.failureCode}
  }
  private async update(scope: Scope, t: Task, mutate: (copy: Task) => void, revision = t.revision) {
    if (revision !== t.revision) throw new ResearchError('conflict')
    const next = structuredClone(t); mutate(next); next.revision++; next.updatedAt=this.now()
    await this.store.replace(scope,next,revision)
    return this.receipt(next)
  }
  async create(scope: Scope, input: ReturnType<typeof createSchema.parse>) {
    scopeSchema.parse(scope); const value=createSchema.parse(input)
    const existing=await this.store.findRequest(scope,value.requestKey)
    const hash=createHash('sha256').update(JSON.stringify(value.snapshot)).digest('hex')
    if (existing) {
      if (existing.snapshotHash!==hash || existing.title!==value.title || existing.objective!==value.objective) throw new ResearchError('request_key_conflict')
      return this.receipt(existing)
    }
    const task: Task={id:randomUUID(),...value,snapshotHash:hash,revision:1,status:'draft',attempt:0,
      createdAt:this.now(),updatedAt:this.now(),deadline:null,observedCodes:[],evidenceIds:[],exploredDimensions:[],reviews:[],
      failureCode:null,confirmedAt:null,attempts:[]}
    await this.store.insert(scope,task);return this.receipt(task)
  }
  async begin(scope: Scope, id: string) {
    const t=await this.get(scope,id)
    if(t.status!=='draft') throw new ResearchError('not_draft')
    return this.update(scope,t,n=>{n.status='running';n.attempt++;n.deadline=new Date(this.clock().getTime()+300000).toISOString()})
  }
  private running(t: Task) {
    if(t.status!=='running') throw new ResearchError('not_running')
    if(!t.deadline || Date.parse(t.deadline)<=this.clock().getTime()) throw new ResearchError('lease_expired')
  }
  async search(scope: Scope, input: ReturnType<typeof searchSchema.parse>) {
    const v=searchSchema.parse(input),t=await this.get(scope,v.taskId);this.running(t)
    const rows=t.snapshot.stocks.filter(r=>r[v.sortBy]!==null && (v.sortBy!=='pe_ratio' || r.pe_ratio!>0))
      .sort((a,b)=>(v.direction==='asc'?1:-1)*(a[v.sortBy]!-b[v.sortBy]! ) || a.code.localeCompare(b.code))
    const page=rows.slice(v.offset,v.offset+v.limit)
    await this.update(scope,t,n=>{
      n.observedCodes=[...new Set([...n.observedCodes,...page.map(r=>r.code)])]
      n.evidenceIds=[...new Set([...n.evidenceIds,...page.map(r=>`snapshot:${r.code}`)])]
      if(v.offset===0)n.exploredDimensions=[...new Set([...n.exploredDimensions,`${v.sortBy}:${v.direction}`])]
    })
    return {matched:rows.length,offset:v.offset,hasMore:v.offset+page.length<rows.length,
      rows:page.map(r=>({...r,evidenceId:`snapshot:${r.code}`})),source:t.snapshot.source,cutoff:t.snapshot.cutoff,kind:t.snapshot.kind}
  }
  async evidence(scope: Scope, input: ReturnType<typeof evidenceSchema.parse>) {
    const v=evidenceSchema.parse(input),t=await this.get(scope,v.taskId);this.running(t)
    if(!t.observedCodes.includes(v.code)) throw new ResearchError('search_stock_first')
    const financial=t.snapshot.financials.find(f=>f.code===v.code)
    if(!financial)return {status:'missing',code:v.code,reason:'no_financial_evidence_in_snapshot'}
    await this.update(scope,t,n=>{n.evidenceIds=[...new Set([...n.evidenceIds,`financial:${v.code}`])]})
    return {status:'ok',evidenceId:`financial:${v.code}`,financial}
  }
  async submit(scope: Scope,input: ReturnType<typeof reviewSchema.parse>) {
    const v=reviewSchema.parse(input),t=await this.get(scope,v.taskId);this.running(t)
    const role=ROLES[t.reviews.length]
    if(!role)throw new ResearchError('all_reviews_saved')
    if(v.role!==role)throw new ResearchError('review_role_mismatch')
    if(role==='decision' && ['amount:desc','change_pct:desc','turnover_pct:desc','pe_ratio:asc'].some(d=>!t.exploredDimensions.includes(d)))throw new ResearchError('explore_four_dimensions_first')
    if(v.evidenceIds.some(id=>!t.evidenceIds.includes(id)))throw new ResearchError('unknown_evidence')
    const codes=[...v.candidates,...v.vetoes,...(v.selectedCode?[v.selectedCode]:[])]
    if(codes.some(code=>!t.observedCodes.includes(code)))throw new ResearchError('unobserved_stock')
    if(role!=='decision' && v.selectedCode!==null)throw new ResearchError('selection_only_in_decision')
    if(role!=='risk' && v.vetoes.length)throw new ResearchError('veto_only_in_risk')
    if(role==='decision' && v.selectedCode){
      const selected=v.selectedCode
      if(t.reviews.some(r=>r.vetoes.includes(selected)))throw new ResearchError('risk_veto')
      if(!t.evidenceIds.includes(`financial:${selected}`) || !v.evidenceIds.includes(`financial:${selected}`)
        || !v.evidenceIds.includes(`snapshot:${selected}`))throw new ResearchError('selection_requires_market_and_financial_evidence')
    }
    return this.update(scope,t,n=>{
      const {taskId,...review}=v;n.reviews.push({...review,role,createdAt:this.now()})
      if(role==='decision'){n.status=v.selectedCode?'ready':'abstained';n.deadline=null}
    })
  }
  async fail(scope: Scope,id: string,reason: string,expectedRevision?: number) {
    const t=await this.get(scope,id)
    if(t.status!=='running')throw new ResearchError('not_running')
    if(reason==='lease_expired' && t.deadline && Date.parse(t.deadline)>this.clock().getTime())throw new ResearchError('lease_active')
    return this.update(scope,t,n=>{n.status='failed';n.failureCode=reason;n.deadline=null},expectedRevision)
  }
  async retry(scope: Scope,id: string,revision: number) {
    const t=await this.get(scope,id)
    if(t.status!=='failed')throw new ResearchError('retry_failed_only')
    if(t.attempt>=3)throw new ResearchError('retry_limit')
    return this.update(scope,t,n=>{
      n.attempts.push({attempt:n.attempt,reviews:n.reviews,failureCode:n.failureCode})
      n.reviews=[];n.observedCodes=[];n.evidenceIds=[];n.exploredDimensions=[];n.failureCode=null;n.status='draft';n.deadline=null
    },revision)
  }
  async confirm(scope: Scope,id: string,revision: number) {
    const t=await this.get(scope,id)
    if(t.status!=='ready' && t.status!=='abstained')throw new ResearchError('not_reviewable')
    return this.update(scope,t,n=>{n.status='confirmed';n.confirmedAt=this.now()},revision)
  }
  async agentSummary(scope: Scope,id: string) {
    const t=await this.get(scope,id)
    return {...this.receipt(t),objective:t.objective,cutoff:t.snapshot.cutoff,source:t.snapshot.source,
      universeCount:t.snapshot.stocks.length,financialCount:t.snapshot.financials.length,
      reviews:t.reviews,evidenceIds:t.evidenceIds,exploredDimensions:t.exploredDimensions,deadline:t.deadline}
  }
}
