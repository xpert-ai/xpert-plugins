import { Inject, Injectable, OnModuleDestroy, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash, randomUUID } from 'node:crypto'
import { In, IsNull, MoreThan, Repository } from 'typeorm'
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity.js'
import { RolesEnum, PermissionsEnum } from '@xpert-ai/contracts'
import {
  RequestContext,
  WorkspaceFilesRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type RuntimeCapabilityRegistry,
} from '@xpert-ai/plugin-sdk'
import {
  DataSourceRuntimeCapability,
  quoteDatabaseIdentifier,
  splitWorkbenchSql,
  type DatabaseObjectDetail,
  type DatabaseObjectRef,
  type DatabaseResult,
  type DatabaseWorkbenchAdapter,
} from '@xpert-ai/plugin-sdk/data-workbench'
import { STUDIO_CONFIG } from './constants.js'
import { exportResult } from './transfer.js'
import { StudioAccess } from './access.js'
import { StudioPolicy, StudioRecord, type StudioRecordKind } from './entities.js'
import {
  artifactSchema,
  changeSchema,
  importSchema,
  policySchema,
  planPayloadSchema,
  querySchema,
  type ArtifactInput,
  type ChangeInput,
  type ImportInput,
  type PlanPayload,
  type PolicyInput,
  type QueryInput,
  type StudioScope,
  type Target,
} from './types.js'

export const scopeWhere = (scope: StudioScope) => ({
  tenantId: scope.tenantId,
  organizationId: scope.organizationId,
  workspaceId: scope.workspaceId,
  userId: scope.userId,
})
export const canonicalJson = (value: unknown): string =>
  JSON.stringify(value, (_key, current: unknown) =>
    current && typeof current === 'object' && !Array.isArray(current)
      ? Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)))
      : current
  )
export const digestPlan = (payload: Omit<PlanPayload, 'digest' | 'approvedBy' | 'receipt'>) =>
  createHash('sha256').update(canonicalJson(payload)).digest('hex')
const targetOf = (value: Target): Target => ({
  dataSourceId: value.dataSourceId,
  database: value.database,
  schema: value.schema,
  engineCatalog: value.engineCatalog,
  sessionId: value.sessionId,
})
const updatePayload = (value: object) => recordPayload(value) as QueryDeepPartialEntity<Record<string, unknown>>
const recordPayload = (value: object): Record<string, unknown> => ({ ...value })

@Injectable()
export class StudioService implements OnModuleDestroy {
  private readonly sessions = new Map<
    string,
    {
      owner: string
      target: Target
      adapter: DatabaseWorkbenchAdapter
      policyRevision: number
      expiresAt: number
      plans: string[]
      timer: ReturnType<typeof setTimeout>
    }
  >()
  private readonly active = new Map<string, { owner: string; adapter: DatabaseWorkbenchAdapter }>()
  constructor(
    @InjectRepository(StudioRecord) private readonly records: Repository<StudioRecord>,
    @InjectRepository(StudioPolicy) private readonly policies: Repository<StudioPolicy>,
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry,
    private readonly access: StudioAccess,
    @Optional() @Inject(STUDIO_CONFIG) private readonly config: {readOnlyTest?:boolean} = {}
  ) {}
  testReadOnly(){return this.config.readOnlyTest===true||process.env.DB_STUDIO_READ_ONLY_TEST==='1'}
  async scope(scope: StudioScope) {
    return this.access.resolve(scope)
  }
  private owner(scope: StudioScope) {
    return JSON.stringify(scopeWhere(scope))
  }
  async onModuleDestroy() {
    for (const session of this.sessions.values()) {
      clearTimeout(session.timer)
      await session.adapter.close()
    }
    this.sessions.clear()
    await Promise.allSettled([...this.active.values()].map(({ adapter }) => adapter.close()))
    this.active.clear()
  }
  async connections(scope: StudioScope) {
    const bound = await this.access.list(scope)
    const all = await this.runtime.require(DataSourceRuntimeCapability).list(scope)
    return { items: all.filter((item) => bound.has(item.id)), testReadOnly: this.testReadOnly() }
  }
  async withAdapter<T>(
    scope: StudioScope,
    target: Target,
    work: (adapter: DatabaseWorkbenchAdapter) => Promise<T>,
    executionId?: string
  ): Promise<T> {
    await this.access.assert(scope, target.dataSourceId)
    const session = target.sessionId ? this.sessions.get(target.sessionId) : undefined
    if (
      target.sessionId &&
      (!session ||
        session.owner !== this.owner(scope) ||
        session.expiresAt < Date.now() ||
        canonicalJson({ ...targetOf(target), sessionId: undefined }) !== canonicalJson(session.target))
    )
      throw new Error('session_expired_or_target_mismatch')
    if (session) {
      const policy = await this.policy(scope, target.dataSourceId)
      if (policy.readOnly || policy.revision !== session.policyRevision) throw new Error('session_policy_changed')
    }
    const adapter =
      session?.adapter ??
      (await this.runtime
        .require(DataSourceRuntimeCapability)
        .open({ actor: scope, dataSourceId: target.dataSourceId, location: target }))
    if (executionId) this.active.set(executionId, { owner: this.owner(scope), adapter })
    try {
      return await work(adapter)
    } finally {
      if (executionId) this.active.delete(executionId)
      if (!session) await adapter.close()
    }
  }
  async transaction(scope: StudioScope, target: Target, action: 'begin' | 'commit' | 'rollback') {
    if (this.testReadOnly()) throw new Error('read_only_test_mode')
    await this.access.assert(scope, target.dataSourceId, true)
    requireSourceEditPermission()
    if (action === 'begin') {
      if(this.sessions.size>=100||[...this.sessions.values()].filter((session)=>session.owner===this.owner(scope)).length>=8)throw new Error('session_limit_reached')
      if (target.sessionId) throw new Error('transaction_already_open')
      const policy = await this.policy(scope, target.dataSourceId)
      if (policy.readOnly) throw new Error('connection_read_only')
      const adapter = await this.runtime
        .require(DataSourceRuntimeCapability)
        .open({ actor: scope, dataSourceId: target.dataSourceId, location: target })
      const id = randomUUID(),
        expiresAt = Date.now() + 5 * 60000
      try {
        if (!(await adapter.capabilities()).transactions) throw new Error('transactions_not_supported')
        await adapter.transaction('begin')
      } catch (error) {
        await adapter.close()
        throw error
      }
      const record = await this.records.save(
        this.records.create({
          ...scopeWhere(scope),
          xpertId: scope.xpertId,
          id,
          kind: 'session',
          dataSourceId: target.dataSourceId,
          title: 'Transaction',
          status: 'running',
          revision: 1,
          payload: { target: targetOf(target), expiresAt: new Date(expiresAt).toISOString() },
        })
      )
      const timer = setTimeout(() => {
        void this.expireSession(scope, id)
      }, 5 * 60000)
      timer.unref()
      this.sessions.set(id, {
        owner: this.owner(scope),
        target: targetOf(target),
        adapter,
        policyRevision: policy.revision,
        expiresAt,
        plans: [],
        timer,
      })
      return { sessionId: record.id, status: 'running', expiresAt: new Date(expiresAt).toISOString() }
    }
    const id = target.sessionId,
      session = id ? this.sessions.get(id) : undefined
    if (!id || !session || session.owner !== this.owner(scope)) throw new Error('session_expired')
    if (action === 'commit') {
      const policy = await this.policy(scope, session.target.dataSourceId)
      if (policy.readOnly || policy.revision !== session.policyRevision) throw new Error('session_policy_changed')
    }
    let status: 'succeeded' | 'cancelled' | 'unknown' = action === 'commit' ? 'succeeded' : 'cancelled'
    try {
      await session.adapter.transaction(action)
    } catch {
      status = 'unknown'
    } finally {
      clearTimeout(session.timer)
      this.sessions.delete(id)
      await session.adapter.close()
    }
    await this.records.update(
      { ...scopeWhere(scope), id },
      { status, payload: updatePayload({ target: session.target, operation: action, plans: session.plans }) }
    )
    for (const planId of session.plans) {
      const plan = await this.record(scope, planId)
      await this.records.update(
        { ...scopeWhere(scope), id: planId, status: 'pending' },
        {
          status,
          payload: updatePayload({
            ...plan.payload,
            transactionReceipt: { sessionId: id, outcome: status, operation: action },
          }),
        }
      )
    }
    return { sessionId: id, status }
  }
  private async expireSession(scope: StudioScope, id: string) {
    const session = this.sessions.get(id)
    if (!session) return
    this.sessions.delete(id)
    await session.adapter.close()
    await this.records.update({ ...scopeWhere(scope), id, status: 'running' }, { status: 'unknown' })
    for (const planId of session.plans)
      await this.records.update({ ...scopeWhere(scope), id: planId, status: 'pending' }, { status: 'unknown' })
  }
  async inspect(
    scope: StudioScope,
    target: Target,
    kind: 'capabilities' | 'locations' | 'objects' | 'describe',
    object?: DatabaseObjectRef,
    page = 1,
    search = ''
  ) {
    return this.withAdapter(scope, target, async (adapter) =>
      kind === 'capabilities'
        ? adapter.capabilities()
        : kind === 'locations'
        ? adapter.locations()
        : kind === 'objects'
        ? adapter.objects({ ...target, page, pageSize: 100, search })
        : object
        ? adapter.describe(object)
        : Promise.reject(new Error('object_required'))
    )
  }
  async read(scope: StudioScope, input: QueryInput, explain = false) {
    const query = querySchema.parse(input),
      id = query.executionId ?? randomUUID()
    await this.access.assert(scope, query.dataSourceId)
    const execution = this.records.create({
      ...scopeWhere(scope),
      xpertId: scope.xpertId,
      id,
      kind: 'execution',
      status: 'running',
      dataSourceId: query.dataSourceId,
      title: explain ? 'EXPLAIN' : 'SQL',
      revision: 1,
      payload: { query, explain },
    })
    await this.records.insert({ ...execution, payload: updatePayload(execution.payload) })
    try {
      const result = await this.withAdapter(
        scope,
        query,
        (adapter) => (explain ? adapter.explain(query) : adapter.query({ ...query, mode: 'read' })),
        id
      )
      execution.status = 'succeeded'
      execution.payload = { query, explain, result, expiresAt: new Date(Date.now() + 86400000).toISOString() }
      await this.records.save(execution)
      return { executionId: id, dataSourceId: query.dataSourceId, target:targetOf(query), result }
    } catch (error) {
      execution.status = 'failed'
      execution.payload = { query, explain, error: safeError(error) }
      await this.records.save(execution)
      throw error
    }
  }
  async cancel(scope: StudioScope, id: string) {
    const running = this.active.get(id)
    if (running) {
      if (running.owner !== this.owner(scope)) throw new Error('execution_scope_denied')
      await running.adapter.cancel()
    }
    return { executionId: id, status: running ? 'cancellation_requested' : 'not_running' }
  }
  async record(scope: StudioScope, id: string) {
    const item = await this.records.findOneBy({ ...scopeWhere(scope), id })
    if (!item) throw new Error('record_not_found')
    if (item.dataSourceId) await this.access.assert(scope, item.dataSourceId)
    await this.expireResult(scope, item)
    return item
  }
  async page(scope: StudioScope, id: string, offset = 0, limit = 50) {
    const record = await this.record(scope, id)
    if (record.kind !== 'execution') throw new Error('execution_required')
    if (typeof record.payload.expiresAt !== 'string' || new Date(record.payload.expiresAt).getTime() < Date.now())
      throw new Error('result_expired')
    const result = record.payload.result as DatabaseResult | undefined
    if (!result) throw new Error('result_unavailable')
    const size = Math.max(1, Math.min(limit, 200)),
      start = Math.max(0, offset)
    return {
      executionId: id,
      dataSourceId: record.dataSourceId,
      ...result,
      rows: result.rows.slice(start, start + size),
      offset: start,
      hasMore: start + size < result.rows.length || result.hasMore,
      totalLoaded: result.rows.length,
    }
  }
  async export(scope: StudioScope, id: string, format: 'csv' | 'json') {
    const record = await this.record(scope, id)
    if (
      record.kind !== 'execution' ||
      typeof record.payload.expiresAt !== 'string' ||
      Date.parse(record.payload.expiresAt) < Date.now()
    )
      throw new Error('result_expired')
    const result = record.payload.result as DatabaseResult | undefined
    if (!result) throw new Error('result_unavailable')
    const content = exportResult(result, format),
      name = `query-${id}.${format}`
    const file = await this.runtime
      .require(WorkspaceFilesRuntimeCapability)
      .uploadBuffer({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        userId: scope.userId,
        catalog: 'user-xperts',
        scopeId: scope.xpertId,
        xpertId: scope.xpertId,
        isolateByUser: true,
        buffer: Buffer.from(content),
        originalName: name,
        fileName: name,
        folder: 'files/db-studio/exports',
        mimeType: format === 'csv' ? 'text/csv' : 'application/json',
      })
    await this.records.save(
      this.records.create({
        ...scopeWhere(scope),
        xpertId: scope.xpertId,
        kind: 'transfer',
        dataSourceId: record.dataSourceId,
        status: 'succeeded',
        title: name,
        payload: { operation: 'export', executionId: id, file, exportedRows: result.rows.length },
        revision: 1,
      })
    )
    return { file, name, content, hasMore: result.hasMore, exportedRows: result.rows.length }
  }
  /** Remove expired row payloads while retaining the execution audit record. */
  async purgeExpiredResults(scope: StudioScope, now = Date.now()) {
    let cursor: string | undefined, expired = 0
    while (true) {
      const executions = await this.records.find({
        where: { ...scopeWhere(scope), kind: 'execution', ...(cursor ? { id: MoreThan(cursor) } : {}) },
        order: { id: 'ASC' },
        take: 500,
      })
      for (const item of executions) if (await this.expireResult(scope, item, now)) expired++
      if (executions.length < 500) return expired
      cursor = executions[executions.length - 1].id
    }
  }
  private async expireResult(scope: StudioScope, item: StudioRecord, now = Date.now()) {
    if (item.kind !== 'execution' || !('result' in item.payload)) return false
    const expiresAt = item.payload.expiresAt
    if (typeof expiresAt === 'string' && Date.parse(expiresAt) >= now) return false
    const { result: _result, ...retained } = item.payload
    item.payload = { ...retained, resultExpired: true }
    await this.records.update(
      { ...scopeWhere(scope), id: item.id, kind: 'execution' },
      { payload: updatePayload(item.payload) }
    )
    return true
  }
  async list(scope: StudioScope, kind: StudioRecordKind, page = 1) {
    return (await this.listPage(scope, kind, page)).items
  }
  async listPage(scope: StudioScope, kind: StudioRecordKind, page = 1) {
    if (kind === 'execution') await this.purgeExpiredResults(scope)
    const bound = await this.access.list(scope)
    const currentPage = Number.isSafeInteger(page) && page > 0 ? page : 1
    const where = { ...scopeWhere(scope), kind }
    // Apply access control before pagination so inaccessible records cannot hide later pages.
    const items = await this.records.find({
      where: [
        { ...where, dataSourceId: IsNull() },
        { ...where, dataSourceId: In([...bound]) },
      ],
      order: { updatedAt: 'DESC', id: 'DESC' },
      skip: (currentPage - 1) * 50,
      take: 51,
    })
    return {
      page: currentPage, pageSize: 50, hasMore: items.length > 50,
      items: items.slice(0, 50).map(({ payload, ...item }) => ({
        ...item,
        summary: kind === 'execution' ? { query: payload.query, explain: payload.explain } : payload,
      })),
    }
  }
  async saveArtifact(scope: StudioScope, value: ArtifactInput) {
    const input = artifactSchema.parse(value)
    if (input.target) await this.access.assert(scope, input.target.dataSourceId)
    const payload = { target: input.target, content: input.content }
    if (input.id) {
      const before = await this.record(scope, input.id)
      if (before.kind !== input.kind) throw new Error('record_kind_mismatch')
      const changed = await this.records.update(
        { ...scopeWhere(scope), id: input.id, revision: input.revision ?? 0 },
        { title: input.title, dataSourceId: input.target?.dataSourceId, payload, revision: () => 'revision + 1' }
      )
      if (changed.affected !== 1) throw new Error('revision_conflict')
      return this.record(scope, input.id)
    }
    return this.records.save(
      this.records.create({
        ...scopeWhere(scope),
        xpertId: scope.xpertId,
        kind: input.kind,
        status: 'saved',
        title: input.title,
        dataSourceId: input.target?.dataSourceId,
        payload,
        revision: 1,
      })
    )
  }
  async policy(scope: StudioScope, id: string) {
    await this.access.assert(scope, id)
    return (
      (await this.policies.findOneBy({
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        dataSourceId: id,
      })) ?? { readOnly: true, autoActions: [], objects: [], revision: 0 }
    )
  }
  async setPolicy(scope: StudioScope, value: PolicyInput) {
    if (!RequestContext.hasRoles([RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN])) throw new Error('administrator_required')
    if (this.testReadOnly()) throw new Error('read_only_test_mode')
    const input = policySchema.parse(value)
    await this.access.assert(scope, input.dataSourceId, true)
    const where = {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      dataSourceId: input.dataSourceId,
    }
    const before = await this.policies.findOneBy(where)
    const fields = {
      readOnly: input.readOnly,
      autoActions: input.autoActions,
      objects: input.objects,
      updatedBy: scope.userId,
      revision: input.revision + 1,
    }
    if (before) {
      const result = await this.policies.update({ ...where, revision: input.revision }, fields)
      if (result.affected !== 1) throw new Error('policy_revision_conflict')
    } else {
      if (input.revision !== 0) throw new Error('policy_revision_conflict')
      await this.policies.save(this.policies.create({ ...where, ...fields }))
    }
    return this.policy(scope, input.dataSourceId)
  }
  async propose(scope: StudioScope, value: ChangeInput) {
    const input = changeSchema.parse(value)
    const statements = splitWorkbenchSql(input.sql)
    if (input.sessionId && !['INSERT', 'UPDATE', 'DELETE'].includes(statements[0]?.words[0]))
      throw new Error('transaction_requires_dml')
    if (statements.length !== 1 || statements[0].effect !== 'write')
      throw new Error('change_requires_one_supported_mutation')
    return this.freeze(
      scope,
      { target: targetOf(input), sql: input.sql, parameters: input.parameters, reason: input.reason, action: 'sql' },
      input.operationId
    )
  }
  async proposeImport(scope: StudioScope, value: ImportInput) {
    const input = importSchema.parse(value)
    if (input.sessionId) throw new Error('import_requires_independent_session')
    return this.freeze(
      scope,
      {
        target: targetOf(input),
        transfer: input,
        reason: 'Import uploaded rows',
        action: 'import',
        object: {
          database: input.database,
          schema: input.schema,
          engineCatalog: input.engineCatalog,
          name: input.table,
          kind: 'table',
        },
      },
      input.operationId
    )
  }
  private async freeze(
    scope: StudioScope,
    input: Omit<PlanPayload, 'digest' | 'policyRevision' | 'expiresAt'>,
    operationId: string
  ) {
    const existing = await this.records.findOneBy({ ...scopeWhere(scope), operationId })
    if (existing) {
      const { policyRevision, digest, expiresAt, approvedBy, receipt, ...old } = existing.payload
      if (canonicalJson(old) !== canonicalJson(input)) throw new Error('operation_id_content_conflict')
      return existing
    }
    const policy = await this.policy(scope, input.target.dataSourceId)
    const authorized =
      !this.testReadOnly() &&
      !policy.readOnly &&
      policy.autoActions.includes(input.action) &&
      Boolean(input.object && policy.objects.some((object) => sameObject(object, input.object!)))
    const frozen = {
      ...input,
      policyRevision: policy.revision,
      expiresAt: new Date(Date.now() + 30 * 60000).toISOString(),
    }
    return this.records.save(
      this.records.create({
        ...scopeWhere(scope),
        xpertId: scope.xpertId,
        kind: 'plan',
        status: authorized ? 'ready' : 'awaiting_approval',
        operationId,
        dataSourceId: input.target.dataSourceId,
        title: input.reason.slice(0, 200),
        payload: recordPayload({ ...frozen, digest: digestPlan(frozen) }),
        revision: 1,
      })
    )
  }
  async preparePlanApproval(scope: StudioScope, id: string) {
    if (this.testReadOnly()) throw new Error('read_only_test_mode')
    const plan = await this.record(scope, id)
    if (plan.kind !== 'plan' || plan.status !== 'awaiting_approval') throw new Error('plan_not_awaiting_approval')
    await this.access.assert(scope, plan.dataSourceId!, true)
    requireSourceEditPermission()
    const payload = planPayloadSchema.parse(plan.payload)
    const policy = await this.policy(scope, plan.dataSourceId!)
    if (policy.readOnly) throw new Error('connection_read_only')
    if (policy.revision !== payload.policyRevision) throw new Error('plan_policy_changed')
    if (Date.parse(payload.expiresAt) < Date.now()) throw new Error('approval_expired')
    const { digest, approvedBy, receipt, ...frozen } = payload
    if (digestPlan(frozen) !== digest) throw new Error('plan_integrity_failed')
    return { plan, payload }
  }
  async approve(scope: StudioScope, id: string, digest: string, approve: boolean) {
    // Recheck policy and permissions after the interrupt; they can change while the user reviews it.
    const { plan, payload } = await this.preparePlanApproval(scope, id)
    if (payload.digest !== digest) throw new Error('approval_content_changed')
    const result = await this.records.update(
      { ...scopeWhere(scope), id, status: 'awaiting_approval', revision: plan.revision },
      {
        status: approve ? 'ready' : 'cancelled',
        payload: updatePayload({ ...payload, approvedBy: scope.userId }),
        revision: plan.revision + 1,
      }
    )
    if (result.affected !== 1) throw new Error('approval_conflict')
    return this.record(scope, id)
  }
  async executePlan(scope: StudioScope, id: string) {
    if (this.testReadOnly()) throw new Error('read_only_test_mode')
    const plan = await this.record(scope, id)
    if (plan.kind !== 'plan') throw new Error('plan_required')
    if (['succeeded', 'unknown', 'pending', 'running'].includes(plan.status)) return plan
    const payload = plan.payload as unknown as PlanPayload
    const { digest, approvedBy, receipt, ...frozen } = payload
    if (digestPlan(frozen) !== digest) throw new Error('plan_integrity_failed')
    await this.access.assert(scope, plan.dataSourceId!, true)
    const policy = await this.policy(scope, plan.dataSourceId!)
    if (policy.readOnly) throw new Error('connection_read_only')
    if (policy.revision !== payload.policyRevision) throw new Error('plan_policy_changed')
    if (Date.parse(payload.expiresAt) < Date.now()) throw new Error('plan_expired')
    const claim = await this.records.update(
      { ...scopeWhere(scope), id, status: plan.status === 'queued' ? 'queued' : 'ready', revision: plan.revision },
      { status: 'running', revision: plan.revision + 1 }
    )
    if (claim.affected !== 1) throw new Error('plan_not_ready_or_already_claimed')
    try {
      const result = await this.withAdapter(
        scope,
        payload.target,
        async (adapter) =>
          payload.transfer
            ? adapter.importRows(payload.transfer)
            : adapter.query({ ...payload.target, sql: payload.sql!, parameters: payload.parameters, mode: 'write' }),
        id
      )
      const session = payload.target.sessionId ? this.sessions.get(payload.target.sessionId) : undefined
      if (session) session.plans.push(id)
      await this.records.update(
        { ...scopeWhere(scope), id, status: 'running' },
        {
          status: session ? 'pending' : result.outcome,
          payload: updatePayload({
            ...payload,
            receipt: session
              ? { ...result, outcome: 'pending', diagnostics: [...result.diagnostics, 'awaiting_transaction_commit'] }
              : result,
          }),
        }
      )
    } catch (error) {
      await this.records.update(
        { ...scopeWhere(scope), id, status: 'running' },
        {
          status: 'unknown',
          payload: updatePayload({
            ...payload,
            receipt: {
              outcome: 'unknown',
              error: safeError(error),
              diagnostics: ['verify_database_state_do_not_replay'],
            },
          }),
        }
      )
    }
    return this.record(scope, id)
  }
  async editResultRow(
    scope: StudioScope,
    executionId: string,
    object: DatabaseObjectRef,
    rowIndex: number,
    columnIndex: number,
    value: unknown,
    operationId: string
  ) {
    const record = await this.record(scope, executionId)
    if (record.kind !== 'execution' || record.status !== 'succeeded') throw new Error('successful_execution_required')
    const query = querySchema.parse(record.payload.query),
      result = record.payload.result as DatabaseResult
    return this.withAdapter(scope, query, async (adapter) => {
      const namespace = adapter.engine === 'postgres' ? object.schema : object.database
      if (!namespace || namespace !== (adapter.engine === 'postgres' ? query.schema : query.database))
        throw new Error('row_target_mismatch')
      const ref = [namespace, object.name].map((name) => quoteDatabaseIdentifier(name, adapter.engine)).join('.')
      const expected = `SELECT * FROM ${ref} LIMIT 100`.replace(/\s+/g, ' ').trim()
      const actual = splitWorkbenchSql(query.sql)[0].sql.replace(/;$/, '').replace(/\s+/g, ' ').trim()
      if (
        actual !== expected ||
        query.parameters?.length ||
        new Set(result.columns.map((column) => column.name)).size !== result.columns.length
      )
        throw new Error('row_edit_requires_unmodified_table_browse')
      const detail = await adapter.describe(object),
        row = result.rows[rowIndex],
        column = result.columns[columnIndex]
      if (!row || !column) throw new Error('result_cell_not_found')
      const key = detail.keys.find(
        (item) =>
          ['primary', 'unique'].includes(item.kind) &&
          item.columns.every((name) => result.columns.some((column) => column.name === name))
      )
      if (!key) throw new Error('unique_key_not_in_results')
      const keys = Object.fromEntries(
        key.columns.map((name) => [name, row[result.columns.findIndex((column) => column.name === name)]])
      )
      return this.proposeRowUpdate(scope, query, object, keys, { [column.name]: value }, operationId)
    })
  }
  async proposeRowUpdate(
    scope: StudioScope,
    target: Target,
    object: DatabaseObjectRef,
    keys: Record<string, unknown>,
    values: Record<string, unknown>,
    operationId: string
  ) {
    return this.withAdapter(scope, target, async (adapter) => {
      const detail = await adapter.describe(object)
      if (!detail.editable) throw new Error('object_not_editable')
      const key = detail.keys.find(
        (key) =>
          (key.kind === 'primary' || key.kind === 'unique') &&
          key.columns.every((name) => Object.hasOwn(keys, name) && keys[name] != null)
      )
      if (!key || Object.keys(keys).some((name) => !key.columns.includes(name)))
        throw new Error('unique_row_key_required')
      const names = Object.keys(values)
      if (
        !names.length ||
        names.some((name) => key.columns.includes(name) || !detail.columns.some((col) => col.name === name))
      )
        throw new Error('invalid_edit_columns')
      const quote = (name: string) => quoteDatabaseIdentifier(name, adapter.engine),
        params = [...names.map((name) => values[name]), ...key.columns.map((name) => keys[name])]
      const parsed = querySchema.shape.parameters.parse(params),
        p = (i: number) => (adapter.engine === 'postgres' ? `$${i}` : '?')
      const namespace =
        adapter.engine === 'postgres' ? object.schema || target.schema || 'public' : object.database || target.database
      if (!namespace) throw new Error('database_required')
      const sql = `UPDATE ${quote(namespace)}.${quote(object.name)} SET ${names
        .map((name, i) => `${quote(name)}=${p(i + 1)}`)
        .join(',')} WHERE ${key.columns.map((name, i) => `${quote(name)}=${p(names.length + i + 1)}`).join(' AND ')}`
      return this.freeze(
        scope,
        {
          target: targetOf(target),
          sql,
          parameters: parsed,
          reason: `Update ${object.name}`,
          action: 'row-update',
          object,
        },
        operationId
      )
    })
  }
  async snapshot(scope: StudioScope, target: Target, title: string) {
    return this.withAdapter(scope, target, async (adapter) => {
      const objects = await adapter.objects({ ...target, pageSize: 1000 })
      const details: DatabaseObjectDetail[] = []
      if (objects.hasMore) throw new Error('snapshot_object_limit_exceeded')
      for (const object of objects.items) details.push(await adapter.describe(object))
      return this.saveArtifact(scope, {
        kind: 'snapshot',
        title,
        target,
        content: JSON.stringify({ engine: adapter.engine, capturedAt: new Date().toISOString(), objects: details }),
      })
    })
  }
}
function sameObject(left: DatabaseObjectRef, right: DatabaseObjectRef) {
  return (
    left.name === right.name &&
    left.kind === right.kind &&
    (left.database ?? '') === (right.database ?? '') &&
    (left.schema ?? '') === (right.schema ?? '') &&
    (left.engineCatalog ?? 'internal') === (right.engineCatalog ?? 'internal')
  )
}
const requireSourceEditPermission = () => {
  // Use the host-authenticated principal, as the host's data-source runtime does.
  // Re-verifying its bearer token here would incorrectly reject OIDC signatures.
  const permissions = RequestContext.currentUser()?.role?.rolePermissions
  if (!permissions?.some((entry) => entry.enabled && entry.permission === PermissionsEnum.DATA_SOURCE_EDIT))
    throw new Error('data_source_edit_permission_required')
}
export function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : 'operation_failed'
  return /^[A-Za-z0-9_:-]{1,160}$/.test(message) ? message : 'operation_failed'
}
