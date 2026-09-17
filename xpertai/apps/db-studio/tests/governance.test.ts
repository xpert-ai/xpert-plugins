import 'reflect-metadata'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { FindOperator, type FindManyOptions, type FindOptionsWhere, type Repository } from 'typeorm'
import { PermissionsEnum } from '@xpert-ai/contracts'
import { DefaultRuntimeCapabilityRegistry, RequestContext } from '@xpert-ai/plugin-sdk'
import {
  DataSourceRuntimeCapability,
  type DatabaseWorkbenchAdapter,
  type DatabaseResult,
} from '@xpert-ai/plugin-sdk/data-workbench'
import { StudioService } from '../src/lib/studio.service.js'
import { StudioAccess } from '../src/lib/access.js'
import { StudioRecord, StudioPolicy } from '../src/lib/entities.js'
import type { StudioScope, ChangeInput } from '../src/lib/types.js'
const scope: StudioScope = {
  tenantId: 'tenant',
  organizationId: 'org',
  userId: 'actor',
  workspaceId: 'workspace',
  xpertId: 'assistant',
}
class MemoryRecords {
  rows = new Map<string, StudioRecord>()
  create(input: Partial<StudioRecord>) {
    return Object.assign(
      new StudioRecord(),
      { id: randomUUID(), createdAt: new Date(), updatedAt: new Date(), revision: 1 },
      input
    )
  }
  async insert(input: StudioRecord) {
    if (this.rows.has(input.id)) throw new Error('duplicate_execution_id')
    await this.save(input)
    return { identifiers: [{ id: input.id }] }
  }
  async save(input: StudioRecord) {
    this.rows.set(input.id, structuredClone(input))
    return structuredClone(input)
  }
  async findOneBy(where: Partial<StudioRecord>) {
    return structuredClone(
      [...this.rows.values()].find((row) =>
        Object.entries(where).every(([key, value]) => row[key as keyof StudioRecord] === value)
      ) ?? null
    )
  }
  async update(where: Partial<StudioRecord>, changes: Record<string, unknown>) {
    const row = structuredClone(
      [...this.rows.values()].find((row) =>
        Object.entries(where).every(([key, value]) => row[key as keyof StudioRecord] === value)
      )
    )
    if (!row) return { affected: 0 }
    for (const [key, value] of Object.entries(changes)) {
      Object.assign(row, { [key]: typeof value === 'function' ? row.revision + 1 : value })
    }
    this.rows.set(row.id, row)
    return { affected: 1 }
  }
  async find(options: FindManyOptions<StudioRecord>) {
    const clauses = (Array.isArray(options.where) ? options.where : [options.where]) as FindOptionsWhere<StudioRecord>[]
    let rows = [...this.rows.values()].filter((row) => clauses.some((where) =>
      Object.entries(where).every(([key, value]) => {
        const actual = row[key as keyof StudioRecord]
        if (!(value instanceof FindOperator)) return actual === value
        if (value.type === 'moreThan') return String(actual) > String(value.value)
        if (value.type === 'isNull') return actual == null
        if (value.type === 'in') return value.value.includes(actual)
        return false
      })
    ))
    if (options.order) rows = rows.sort((left, right) => {
      for (const [key, direction] of Object.entries(options.order!)) {
        const a = left[key as keyof StudioRecord], b = right[key as keyof StudioRecord]
        const diff = a instanceof Date && b instanceof Date ? a.getTime() - b.getTime() : String(a).localeCompare(String(b))
        if (diff) return direction === 'DESC' ? -diff : diff
      }
      return 0
    })
    return structuredClone(rows.slice(options.skip ?? 0, (options.skip ?? 0) + (options.take ?? rows.length)))
  }
}
function fixture(fail = false, engine:'doris'|'mysql'|'postgres'='doris') {
  const records = new MemoryRecords(),
    policy = { readOnly: false, autoActions: [], objects: [], revision: 1 },
    counters = { writes: 0, opens: 0, closed:0, transactions:[] as string[] },
    authorization = { allowed: true }
  const result: DatabaseResult = {
    columns: [],
    rows: [],
    affectedRows: 1,
    durationMs: 1,
    hasMore: false,
    truncated: false,
    outcome: 'succeeded',
    diagnostics: [],
  }
  const adapter: DatabaseWorkbenchAdapter = {
    engine,
    capabilities: async () => ({
      engine,
      version: 'doris-3.0.8',
      query: true,
      explain: true,
      transactions: engine!=='doris',
      cancel: true,
      import: true,
      writes: true,
      nativeReadOnly: false,
      objectKinds: ['table'],
      diagnostics: [],
    }),
    locations: async () => [],
    objects: async () => ({ items: [], page: 1, pageSize: 100, hasMore: false }),
    describe: async () => {
      throw new Error('not_used')
    },
    query: async (input) => {
      if (input.mode === 'write') {
        counters.writes++
        if (fail) throw new Error('transport_lost')
      }
      return result
    },
    explain: async () => result,
    transaction: async (action) => {counters.transactions.push(action)},
    cancel: async () => {},
    close: async () => {counters.closed++},
    importRows: async () => ({ outcome: 'succeeded', label: 'mock', loadedRows: 1, filteredRows: 0, diagnostics: [] }),
  }
  const runtime = new DefaultRuntimeCapabilityRegistry().register(DataSourceRuntimeCapability, {
    list: async () => [{ id: 'source', name: 'Mock Doris', engine: 'doris' }],
    open: async () => {
      counters.opens++
      return adapter
    },
  })
  const access = {
    resolve: async (input: StudioScope) => input,
    list: async () => new Set(authorization.allowed ? ['source'] : []),
    assert: async (_scope: StudioScope, id: string) => {
      if (!authorization.allowed || id !== 'source') throw new Error('workspace_connection_denied')
    },
  }
  const service = new StudioService(
    records as unknown as Repository<StudioRecord>,
    { findOneBy: async () => policy } as unknown as Repository<StudioPolicy>,
    runtime,
    access as unknown as StudioAccess
  )
  return { service, records, policy, counters, authorization }
}
const change = (): ChangeInput => ({
  dataSourceId: 'source',
  database: 'analytics',
  sql: 'UPDATE orders SET amount = ?',
  parameters: ['12.3456'],
  reason: 'Explicit mock change',
  operationId: randomUUID(),
})
const withPermission = async (run: () => Promise<void>) => {
  await withAuthenticatedPermissions([{ permission: PermissionsEnum.DATA_SOURCE_EDIT, enabled: true }], run)
}
test('plans freeze the target, require approval, and execute exactly once', () =>
  withPermission(async () => {
    const { service, counters } = fixture(),
      input = change(),
      plan = await service.propose(scope, input)
    input.database = 'another'
    assert.equal(plan.status, 'awaiting_approval')
    await assert.rejects(() => service.executePlan(scope, plan.id), /not_ready/)
    const approved = await service.approve(scope, plan.id, String(plan.payload.digest), true)
    assert.equal(approved.status, 'ready')
    const receipt = await service.executePlan(scope, plan.id)
    assert.equal(receipt.status, 'succeeded')
    assert.equal((receipt.payload.target as { database: string }).database, 'analytics')
    await service.executePlan(scope, plan.id)
    assert.equal(counters.writes, 1)
  }))
test('changed content cannot reuse an operation ID', async () => {
  const { service } = fixture(),
    input = change(),
    first = await service.propose(scope, input)
  assert.equal((await service.propose(scope, input)).id, first.id)
  await assert.rejects(
    () => service.propose(scope, { ...input, sql: 'UPDATE orders SET amount=999' }),
    /content_conflict/
  )
})
test('approval binds the exact digest and current policy version', () =>
  withPermission(async () => {
    const { service, policy, counters } = fixture(),
      plan = await service.propose(scope, change())
    await assert.rejects(() => service.approve(scope, plan.id, '0'.repeat(64), true), /content_changed/)
    policy.revision++
    assert.ok(Date.parse(String(plan.payload.expiresAt)) > Date.now())
    await assert.rejects(() => service.approve(scope, plan.id, String(plan.payload.digest), true), {
      message: 'plan_policy_changed',
    })
    assert.equal((await service.record(scope, plan.id)).status, 'awaiting_approval')
    assert.equal(counters.writes, 0)
  }))
test('another actor or organization cannot retrieve or execute a plan', async () => {
  const { service } = fixture(),
    plan = await service.propose(scope, change())
  await assert.rejects(() => service.record({ ...scope, userId: 'other' }, plan.id), /not_found/)
  await assert.rejects(() => service.record({ ...scope, organizationId: 'other' }, plan.id), /not_found/)
})
test('modified persisted plans fail integrity checks before database access', () =>
  withPermission(async () => {
    const { service, records, counters } = fixture(),
      plan = await service.propose(scope, change())
    await service.approve(scope, plan.id, String(plan.payload.digest), true)
    records.rows.get(plan.id)!.payload.sql = 'DROP TABLE orders'
    await assert.rejects(() => service.executePlan(scope, plan.id), /integrity/)
    assert.equal(counters.writes, 0)
  }))
test('connection loss during a write is unknown and is never replayed', () =>
  withPermission(async () => {
    const { service, counters } = fixture(true),
      plan = await service.propose(scope, change())
    await service.approve(scope, plan.id, String(plan.payload.digest), true)
    assert.equal((await service.executePlan(scope, plan.id)).status, 'unknown')
    assert.equal((await service.executePlan(scope, plan.id)).status, 'unknown')
    assert.equal(counters.writes, 1)
  }))
test('duplicate concurrent submissions cannot both claim a ready plan', () =>
  withPermission(async () => {
    const { service, counters } = fixture(),
      plan = await service.propose(scope, change())
    await service.approve(scope, plan.id, String(plan.payload.digest), true)
    await Promise.allSettled([service.executePlan(scope, plan.id), service.executePlan(scope, plan.id)])
    assert.equal(counters.writes, 1)
  }))
test('revoked workspace bindings deny stored results and execution', async () => {
  const { service, authorization, counters } = fixture()
  const read = await service.read(scope, { dataSourceId: 'source', sql: 'SELECT 1' })
  authorization.allowed = false
  await assert.rejects(() => service.page(scope, read.executionId), /denied/)
  await assert.rejects(() => service.read(scope, { dataSourceId: 'source', sql: 'SELECT 1' }), /denied/)
  assert.equal(counters.opens, 1)
})
test('read-only test mode overrides approval and preauthorization', () =>
  withPermission(async () => {
    const { service, counters } = fixture(),
      plan = await service.propose(scope, change())
    const before = process.env.DB_STUDIO_READ_ONLY_TEST
    process.env.DB_STUDIO_READ_ONLY_TEST = '1'
    try {
      await assert.rejects(() => service.approve(scope, plan.id, String(plan.payload.digest), true), /read_only_test/)
      await assert.rejects(() => service.executePlan(scope, plan.id), /read_only_test/)
      assert.equal(counters.writes, 0)
    } finally {
      if (before === undefined) delete process.env.DB_STUDIO_READ_ONLY_TEST
      else process.env.DB_STUDIO_READ_ONLY_TEST = before
    }
  }))

test('JSONB object key order does not invalidate frozen approval', () =>
  withPermission(async () => {
    const { service, records } = fixture(),
      plan = await service.propose(scope, change())
    const saved = records.rows.get(plan.id)!
    saved.payload = Object.fromEntries(Object.entries(saved.payload).reverse())
    await service.approve(scope, plan.id, String(plan.payload.digest), true)
    assert.equal((await service.executePlan(scope, plan.id)).status, 'succeeded')
  }))

test('client execution IDs cannot overwrite another scoped record',async()=>{
 const {service,records}=fixture(),id=randomUUID(),other=records.create({...scope,userId:'someone-else',id,kind:'execution',title:'private',payload:{secret:'untouched'},status:'succeeded'})
 await records.save(other)
 await assert.rejects(()=>service.read(scope,{dataSourceId:'source',executionId:id,sql:'SELECT 1'}),/duplicate_execution/)
 assert.equal(records.rows.get(id)?.userId,'someone-else');assert.equal(records.rows.get(id)?.payload.secret,'untouched')
})
test('revoking a connection hides its saved drafts from navigation restore',async()=>{
 const {service,authorization}=fixture();await service.saveArtifact(scope,{kind:'draft',title:'Private',target:{dataSourceId:'source'},content:'SELECT 1'});assert.equal((await service.list(scope,'draft')).length,1);authorization.allowed=false;assert.deepEqual(await service.list(scope,'draft'),[])
})
test('listing executions purges expired row payloads but keeps the audit record', async () => {
  const { service, records } = fixture()
  const execution = records.create({
    ...scope,
    kind: 'execution',
    status: 'succeeded',
    dataSourceId: 'source',
    title: 'Expired query',
    payload: {
      query: { dataSourceId: 'source', database: 'analytics', sql: 'SELECT 1' },
      explain: false,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      result: { rows: [['secret']], columns: [] },
    },
  })
  await records.save(execution)
  await service.list(scope, 'execution')
  const retained = records.rows.get(execution.id)
  assert.equal(retained?.payload.result, undefined)
  assert.equal(retained?.payload.resultExpired, true)
})
test('frozen plans reject expired human approvals',()=>withPermission(async()=>{
 const {service,records}=fixture(),plan=await service.propose(scope,change());records.rows.get(plan.id)!.payload.expiresAt='2000-01-01T00:00:00Z';await assert.rejects(()=>service.approve(scope,plan.id,String(plan.payload.digest),true),/expired/)
}))
test('policy revisions revoke already approved plans before driver access',()=>withPermission(async()=>{
 const {service,policy,counters}=fixture(),plan=await service.propose(scope,change());await service.approve(scope,plan.id,String(plan.payload.digest),true);policy.revision++;await assert.rejects(()=>service.executePlan(scope,plan.id),{message:'plan_policy_changed'});assert.equal(counters.writes,0);assert.equal(counters.opens,0)
}))

for (const phase of ['approval', 'execution'] as const) {
  test(`${phase} reports a real timeout when the unchanged policy reaches the plan deadline`, (t) =>
    withPermission(async () => {
      const { service, counters } = fixture()
      const plan = await service.propose(scope, change())
      if (phase === 'execution') await service.approve(scope, plan.id, String(plan.payload.digest), true)
      t.mock.method(Date, 'now', () => Date.parse(String(plan.payload.expiresAt)) + 1)
      await assert.rejects(
        () => phase === 'approval'
          ? service.approve(scope, plan.id, String(plan.payload.digest), true)
          : service.executePlan(scope, plan.id),
        { message: phase === 'approval' ? 'approval_expired' : 'plan_expired' }
      )
      assert.equal(counters.writes, 0)
      assert.equal(counters.opens, 0)
      assert.equal((await service.record(scope, plan.id)).status, phase === 'approval' ? 'awaiting_approval' : 'ready')
    }))

  test(`${phase} reports read-only protection instead of a timeout`, () =>
    withPermission(async () => {
      const { service, policy, counters } = fixture()
      const plan = await service.propose(scope, change())
      if (phase === 'execution') await service.approve(scope, plan.id, String(plan.payload.digest), true)
      policy.readOnly = true
      policy.revision++
      await assert.rejects(
        () => phase === 'approval'
          ? service.approve(scope, plan.id, String(plan.payload.digest), true)
          : service.executePlan(scope, plan.id),
        { message: 'connection_read_only' }
      )
      assert.equal(counters.writes, 0)
      assert.equal(counters.opens, 0)
    }))
}

test('a fresh plan can be approved under the new policy while the old plan stays invalid', () =>
  withPermission(async () => {
    const { service, policy, counters } = fixture()
    const oldPlan = await service.propose(scope, change())
    policy.revision++
    const newPlan = await service.propose(scope, change())
    await assert.rejects(() => service.approve(scope, oldPlan.id, String(oldPlan.payload.digest), true), {
      message: 'plan_policy_changed',
    })
    await service.approve(scope, newPlan.id, String(newPlan.payload.digest), true)
    assert.equal((await service.executePlan(scope, newPlan.id)).status, 'succeeded')
    assert.equal(counters.writes, 1)
  }))
test('Doris cannot open an inherited MySQL transaction',()=>withPermission(async()=>{const {service}=fixture();await assert.rejects(()=>service.transaction(scope,{dataSourceId:'source'},'begin'),/not_supported/)}))
for(const engine of ['mysql','postgres'] as const)test(`${engine}: approved writes remain pending until explicit commit on the original session`,()=>withPermission(async()=>{
 const {service,counters}=fixture(false,engine),target={dataSourceId:'source',database:'analytics'};const session=await service.transaction(scope,target,'begin');const frozenTarget={...target,sessionId:session.sessionId};const plan=await service.propose(scope,{...change(),...frozenTarget});await service.approve(scope,plan.id,String(plan.payload.digest),true);const executed=await service.executePlan(scope,plan.id);assert.equal(executed.status,'pending');assert.equal(counters.opens,1);assert.equal(counters.closed,0);await service.read(scope,{...frozenTarget,sql:'SELECT 1'});assert.equal(counters.opens,1);assert.equal((await service.transaction(scope,frozenTarget,'commit')).status,'succeeded');assert.equal((await service.record(scope,plan.id)).status,'succeeded');assert.equal(counters.closed,1);assert.deepEqual(counters.transactions,['begin','commit'])
}))
test('session targets and actors are frozen and cannot be rebound',()=>withPermission(async()=>{
 const {service}=fixture(false,'mysql'),session=await service.transaction(scope,{dataSourceId:'source',database:'analytics'},'begin');await assert.rejects(()=>service.read({...scope,userId:'other'},{dataSourceId:'source',database:'analytics',sessionId:session.sessionId,sql:'SELECT 1'}),/session_expired_or_target/);await assert.rejects(()=>service.read(scope,{dataSourceId:'source',database:'different',sessionId:session.sessionId,sql:'SELECT 1'}),/target_mismatch/);await service.transaction(scope,{dataSourceId:'source',sessionId:session.sessionId},'rollback')
}))
test('MySQL implicit-commit DDL cannot enter a transaction plan',()=>withPermission(async()=>{const{service}=fixture(false,'mysql'),session=await service.transaction(scope,{dataSourceId:'source'},'begin');await assert.rejects(()=>service.propose(scope,{...change(),sessionId:session.sessionId,sql:'ALTER TABLE orders ADD COLUMN a INT'}),/requires_dml/);await service.transaction(scope,{dataSourceId:'source',sessionId:session.sessionId},'rollback')}))

const withAuthenticatedPermissions = async (permissions: Array<{ permission: PermissionsEnum; enabled: boolean }>, run: () => Promise<void>) => {
  const currentUser = RequestContext.currentUser, hasPermission = RequestContext.hasPermission
  // The host authenticates both JWT and OIDC requests and supplies the user role.
  const user = { id: scope.userId, tenantId: scope.tenantId, role: { rolePermissions: permissions } } as ReturnType<typeof RequestContext.currentUser>
  RequestContext.currentUser = () => user
  RequestContext.hasPermission = () => { throw Object.assign(new Error('invalid algorithm'), { name: 'JsonWebTokenError' }) }
  try { await run() } finally { RequestContext.currentUser = currentUser; RequestContext.hasPermission = hasPermission }
}
test('OIDC users without enabled source-edit permission cannot approve', async () => {
  for (const permissions of [[], [{ permission: PermissionsEnum.DATA_SOURCE_EDIT, enabled: false }], [{ permission: PermissionsEnum.DATA_SOURCE_VIEW, enabled: true }]]) {
    await withAuthenticatedPermissions(permissions, async () => {
      const { service } = fixture(), plan = await service.propose(scope, change())
      await assert.rejects(() => service.approve(scope, plan.id, String(plan.payload.digest), true), /data_source_edit_permission_required/)
      assert.equal((await service.record(scope, plan.id)).status, 'awaiting_approval')
      await assert.rejects(() => service.transaction(scope, { dataSourceId: 'source' }, 'begin'), /data_source_edit_permission_required/)
    })
  }
})
test('authenticated OIDC role permissions allow approval without local token re-verification', () =>
  withAuthenticatedPermissions([{ permission: PermissionsEnum.DATA_SOURCE_EDIT, enabled: true }], async () => {
    const { service } = fixture(), plan = await service.propose(scope, change())
    assert.equal((await service.approve(scope, plan.id, String(plan.payload.digest), true)).status, 'ready')
  }))
test('generic record reads expire result rows without first listing history', async () => {
  const { service, records } = fixture()
  const execution = await records.save(records.create({ ...scope, kind: 'execution', status: 'succeeded', dataSourceId: 'source', payload: {
    query: { dataSourceId: 'source', sql: 'SELECT 1' }, expiresAt: '2000-01-01T00:00:00Z', result: { rows: [['expired']] }
  } }))
  const retained = await service.record(scope, execution.id)
  assert.equal(retained.payload.result, undefined)
  assert.equal(retained.payload.resultExpired, true)
  assert.ok(retained.payload.query)
  assert.equal(records.rows.get(execution.id)?.payload.result, undefined)
  await assert.rejects(() => service.page(scope, execution.id), /result_expired/)
  await assert.rejects(() => service.export(scope, execution.id, 'json'), /result_expired/)
})
test('expiration cleanup reaches later batches and preserves current results and other scopes', async () => {
  const { service, records } = fixture()
  for (let index = 0; index < 1005; index++) await records.save(records.create({ ...scope, id: String(index).padStart(6, '0'), kind: 'execution', payload: {
    expiresAt: index < 501 ? '2999-01-01T00:00:00Z' : '2000-01-01T00:00:00Z', result: { rows: [[index]] }
  } }))
  const other = await records.save(records.create({ ...scope, userId: 'other', kind: 'execution', payload: { expiresAt: '2000-01-01T00:00:00Z', result: { rows: [['private']] } } }))
  assert.equal(await service.purgeExpiredResults(scope), 504)
  assert.equal(records.rows.get('001004')?.payload.result, undefined)
  assert.ok(records.rows.get('000000')?.payload.result)
  assert.ok(records.rows.get(other.id)?.payload.result)
  assert.equal(await service.purgeExpiredResults(scope), 0)
})

test('collection pagination includes every accessible record beyond fifty and excludes other scopes', async () => {
  const { service, records } = fixture()
  for (let index = 0; index < 115; index++) await records.save(records.create({
    ...scope, kind: 'favorite', title: `saved-${index}`, payload: { content: 'SELECT 1' },
    dataSourceId: index < 60 ? 'denied' : 'source',
  }))
  await records.save(records.create({ ...scope, userId: 'another', kind: 'favorite', title: 'private', payload: {} }))
  await records.save(records.create({ ...scope, kind: 'favorite', title: 'no source', payload: {} }))
  const first = await service.listPage(scope, 'favorite', 1)
  const second = await service.listPage(scope, 'favorite', 2)
  assert.equal(first.items.length, 50)
  assert.equal(first.hasMore, true)
  assert.equal(second.items.length, 6)
  assert.equal(second.hasMore, false)
  const all = [...first.items, ...second.items]
  assert.equal(new Set(all.map((item) => item.id)).size, 56)
  assert.ok(all.every((item) => item.userId === scope.userId && item.dataSourceId !== 'denied'))
  assert.deepEqual(await service.list(scope, 'favorite', 2), second.items)
})
