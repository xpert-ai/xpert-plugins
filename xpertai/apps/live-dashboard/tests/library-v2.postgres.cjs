// Opt-in: use a disposable PostgreSQL database. This test creates/drops only its own random schema.
require('reflect-metadata')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { DataSource } = require('typeorm')
const { graph, services, asset, entities } = require('./library-v2-fixture.cjs')
const { encodePackage, decodePackage, reference } = require('../dist/lib/library/archive.js')
const { resourceHash } = require('../dist/lib/library/resource-json.js')
const { DashboardLibraryViewProvider } = require('../dist/lib/library-view.provider.js')
const url = process.env.LIVE_DASHBOARD_LIBRARY_TEST_DATABASE_URL

test('Library V2 PostgreSQL transactions and SDK boundaries', { skip: !url }, async t => {
  const schema = `library_test_${randomUUID().replaceAll('-', '')}`
  const db = new DataSource({ type: 'postgres', url, schema, entities: entities.LIBRARY_V2_ENTITIES,
    synchronize: false, extra: { options: `-c search_path=${schema},public` } })
  await db.initialize()
  t.after(async () => { await db.query(`DROP SCHEMA "${schema}" CASCADE`); await db.destroy() })
  await db.query(`CREATE SCHEMA "${schema}"`)
  await db.synchronize()
  const importGraph = async f => {
    const g = graph(), prepared = await f.transfers.prepare(f.context, encodePackage(g.package), 'reuse', randomUUID())
    const done = await f.transfers.commit(f.context, prepared.importId)
    const task = (await f.catalog.list(f.context, { kind: 'example-task' })).items[0]
    return { ...g, prepared, done, taskRow: task }
  }

  await t.test('imports dependency graph, restart/retry reuses releases and exact bytes export', async () => {
    const f = services(db), g = await importGraph(f)
    assert.equal(g.done.status, 'complete'); assert.equal(g.done.releaseIds.length, 4)
    const restarted = services(db, f.runtime)
    assert.deepEqual(await restarted.transfers.commit(f.context, g.prepared.importId), g.done)
    const result = await f.catalog.exportPackage(f.context, [g.taskRow.releaseId])
    assert.deepEqual(encodePackage(result), encodePackage(g.package))
    assert.equal(f.runtime.state.writes, 1)
    const stored = await db.getRepository(entities.LibraryTransferRecord).findOneByOrFail({ id: g.prepared.importId })
    assert.equal(stored.file.source, 'platform.workspace.files')
    assert.equal('storageProvider' in stored.file, false)
  })
  await t.test('request idempotency, copy mapping and job scope survive concurrent preparation', async () => {
    const f = services(db), g = graph(), bytes = encodePackage(g.package), requestId = randomUUID()
    const [a, b] = await Promise.all([f.transfers.prepare(f.context, bytes, 'copy', requestId), f.transfers.prepare(f.context, bytes, 'copy', requestId)])
    assert.equal(a.importId, b.importId); assert.deepEqual(a.items, b.items)
    assert.ok(a.items.every(item => !g.package.resources.some(original => original.logicalId === item.logicalId)))
    await assert.rejects(f.transfers.prepare(f.context, bytes, 'reuse', requestId), /REQUEST_CONFLICT/)
    await assert.rejects(f.transfers.inspect({ ...f.context, userId: randomUUID() }, a.importId), /DENIED/)
    await f.transfers.commit(f.context, a.importId)
    const task = (await f.catalog.list(f.context, { kind: 'example-task' })).items[0]
    const copied = await f.catalog.exportPackage(f.context, [task.releaseId])
    assert.equal(decodePackage(encodePackage(copied)).resources.length, 4)
    for (const dep of copied.resources.at(-1).dependencies) assert.equal(dep.sha256, resourceHash(copied.resources.find(d => d.logicalId === dep.logicalId)))
  })
  await t.test('ZIP import into another tenant recreates private files without source host identities', async () => {
    const source = services(db), g = await importGraph(source)
    const bytes = encodePackage(await source.catalog.exportPackage(source.context, [g.taskRow.releaseId]))
    const destination = services(db), job = await destination.transfers.prepare(destination.context, bytes, 'reuse', randomUUID())
    await destination.transfers.commit(destination.context, job.importId)
    const target = (await destination.catalog.list(destination.context, { kind: 'example-task' })).items[0]
    assert.notEqual(target.releaseId, g.taskRow.releaseId)
    assert.equal(target.sha256, g.taskRow.sha256)
    assert.equal((await destination.catalog.read(destination.context, target.releaseId)).document.logicalId, g.task.logicalId)
    assert.deepEqual(await destination.files.read(await destination.catalog.actor(destination.context), g.file), g.bytes)
    await assert.rejects(destination.catalog.read(destination.context, g.taskRow.releaseId), /DENIED/)
    assert.equal(await db.getRepository(entities.LibraryPublicationRecord).countBy({ ownerId: destination.context.userId }), 0)
    const sourceFiles = [...source.runtime.state.artifacts.keys()]
    assert.ok([...destination.runtime.state.artifacts.keys()].every(id => !sourceFiles.includes(id)))
  })
  await t.test('failed attachment upload is retryable without duplicate Artifacts', async () => {
    const f = services(db), g = graph(), job = await f.transfers.prepare(f.context, encodePackage(g.package), 'reuse', randomUUID())
    f.runtime.state.failWrite = true
    await assert.rejects(f.transfers.commit(f.context, job.importId), /UPLOAD_FAILED/)
    assert.equal((await f.catalog.list(f.context, {})).total, 0)
    assert.equal((await f.transfers.inspect(f.context, job.importId)).status, 'failed')
    assert.equal(f.runtime.state.artifacts.size, 1)
    f.runtime.state.failWrite = false
    assert.equal((await f.transfers.commit(f.context, job.importId)).status, 'complete')
    assert.equal(f.runtime.state.artifacts.size, 1)
  })
  await t.test('final transaction failure exposes zero versions and can be retried', async () => {
    const f = services(db), g = graph(), job = await f.transfers.prepare(f.context, encodePackage(g.package), 'reuse', randomUUID())
    const persist = f.catalog.persistVersion.bind(f.catalog)
    let count = 0
    f.catalog.persistVersion = async (...args) => { const result = await persist(...args); if (++count === 2) throw Error('SIMULATED_DB_FAILURE'); return result }
    await assert.rejects(f.transfers.commit(f.context, job.importId), /SIMULATED_DB_FAILURE/)
    assert.equal((await f.catalog.list(f.context, {})).total, 0)
    assert.equal(await db.getRepository(entities.LibraryVersionRecord).countBy({ ownerId: f.context.userId }), 0)
    f.catalog.persistVersion = persist
    assert.equal((await f.transfers.commit(f.context, job.importId)).releaseIds.length, 4)
  })
  await t.test('version conflict never overwrites a released definition', async () => {
    const f = services(db), g = await importGraph(f), changed = structuredClone(g.template)
    changed.title = 'Changed content at the same version'
    const package2 = { resources: [changed], roots: [reference(changed)], blobs: new Map() }
    const job = await f.transfers.prepare(f.context, encodePackage(package2), 'reuse', randomUUID())
    assert.equal(job.items[0].outcome, 'conflict')
    await assert.rejects(f.transfers.commit(f.context, job.importId), /VERSION_CONFLICT/)
    const row = (await f.catalog.list(f.context, { kind: 'analysis-template' })).items[0]
    assert.equal((await f.catalog.read(f.context, row.releaseId)).document.title, g.template.title)
  })
  await t.test('concurrent imports reuse a single immutable graph', async () => {
    const f = services(db), bytes = encodePackage(graph().package)
    const jobs = await Promise.all([1, 2].map(() => f.transfers.prepare(f.context, bytes, 'reuse', randomUUID())))
    const results = await Promise.all(jobs.map(job => f.transfers.commit(f.context, job.importId)))
    assert.deepEqual(results[0].releaseIds, results[1].releaseIds)
    assert.equal((await f.catalog.list(f.context, {})).total, 4)
    assert.equal(f.runtime.state.artifacts.size, 1)
  })
  await t.test('draft revision CAS, immutable release and numeric latest-version ordering', async () => {
    const f = services(db), document = graph().template
    const draft = await f.catalog.saveDraft(f.context, document, 0)
    const attempts = await Promise.allSettled([1, 2].map(() => f.catalog.saveDraft(f.context, document, 1)))
    assert.equal(attempts.filter(a => a.status === 'fulfilled').length, 1)
    await assert.rejects(f.catalog.releaseDraft(f.context, draft.draftId, 1), /DRAFT_CONFLICT/)
    await f.catalog.releaseDraft(f.context, draft.draftId, 2)
    let next = await f.catalog.saveDraft(f.context, { ...document, version: '1.10.0' }, 2)
    await f.catalog.releaseDraft(f.context, next.draftId, next.revision)
    next = await f.catalog.saveDraft(f.context, { ...document, version: '1.2.0' }, 3)
    await f.catalog.releaseDraft(f.context, next.draftId, next.revision)
    const latest = await f.catalog.list(f.context, { category: 'sales', search: '销售' })
    assert.equal(latest.total, 1); assert.equal(latest.items[0].version, '1.10.0')
    assert.equal('document' in latest.items[0], false)
  })
  await t.test('read-only project access is distinct from write and tenant/owner scope', async () => {
    const f = services(db), g = await importGraph(f), readContext = { ...f.context, readonly: true }
    assert.equal((await f.catalog.list(readContext, {})).total, 4)
    assert.equal((await f.catalog.read(readContext, g.taskRow.releaseId)).document.logicalId, g.task.logicalId)
    await assert.rejects(f.catalog.saveDraft(readContext, g.template, 0), /ACCESS_DENIED/)
    for (const context of [{ ...f.context, tenantId: randomUUID() }, { ...f.context, organizationId: randomUUID() }, { ...f.context, userId: randomUUID() }]) {
      assert.equal((await f.catalog.list(context, {})).total, 0)
      await assert.rejects(f.catalog.read(context, g.taskRow.releaseId), /RESOURCE_DENIED/)
    }
    await assert.rejects(f.catalog.list({ ...f.context, denied: true }, {}), /PROJECT_DENIED/)
  })
  await t.test('publication is explicit, fileless-only, cross-tenant readable and revocable', async () => {
    const f = services(db), g = await importGraph(f), visitor = { ...f.context, tenantId: randomUUID(), userId: randomUUID() }
    await assert.rejects(f.catalog.publish(f.context, g.taskRow.releaseId, false), /CONFIRMATION_REQUIRED/)
    await assert.rejects(f.catalog.publish(f.context, g.taskRow.releaseId, true), /PUBLIC_FILE_COPY_UNAVAILABLE/)
    assert.equal(await db.getRepository(entities.LibraryPublicationRecord).countBy({ ownerId: f.context.userId }), 0)
    const template = (await f.catalog.list(f.context, { kind: 'analysis-template' })).items[0]
    await f.catalog.publish(f.context, template.releaseId, true)
    assert.equal((await f.catalog.read(visitor, template.releaseId)).capabilities.canExport, true)
    assert.ok((await f.catalog.list(visitor, { audience: 'public' })).items.some(r => r.releaseId === template.releaseId))
    assert.equal((await f.catalog.exportPackage(visitor, [template.releaseId])).resources.length, 1)
    await assert.rejects(f.catalog.withdraw(visitor, template.releaseId), /DENIED/)
    await f.catalog.withdraw(f.context, template.releaseId)
    await assert.rejects(f.catalog.exportPackage(visitor, [template.releaseId]), /DENIED/)
  })
  await t.test('staging ZIP mutation and active lease block import; cancellation is terminal', async () => {
    const f = services(db), job = await f.transfers.prepare(f.context, encodePackage(graph().package), 'reuse', randomUUID())
    const repository = db.getRepository(entities.LibraryTransferRecord), row = await repository.findOneByOrFail({ id: job.importId })
    await repository.update(row.id, { status: 'running', leaseToken: randomUUID(), leaseUntil: new Date(Date.now() + 60_000) })
    await assert.rejects(f.transfers.commit(f.context, row.id), /IMPORT_RUNNING/)
    await assert.rejects(f.transfers.cancel(f.context, row.id), /IMPORT_RUNNING/)
    await repository.update(row.id, { leaseUntil: new Date(0) })
    f.runtime.state.files.set(row.file.filePath, Buffer.from('changed'))
    await assert.rejects(f.transfers.commit(f.context, row.id), /IMPORT_INTEGRITY/)
    await f.transfers.cancel(f.context, row.id)
    await assert.rejects(f.transfers.commit(f.context, row.id), /IMPORT_CANCELLED/)
  })
  await t.test('cleanup retains referenced files and retries platform deletion failures', async () => {
    const f = services(db), g = await importGraph(f), before = new Date(Date.now() - 2 * 86_400_000), old = new Date(Date.now() - 3 * 86_400_000)
    const bytes = Buffer.from('unused text'), descriptor = asset(bytes, { id: 'notes', purpose: 'supporting', mimeType: 'text/plain', fileName: 'notes.txt' })
    await f.catalog.upload(f.context, descriptor, bytes)
    const actor = await f.catalog.actor(f.context, true), repository = db.getRepository(entities.LibraryFileRecord)
    await repository.update(actor, { createdAt: old })
    await assert.rejects(f.files.cleanup(actor, new Date()), /RETENTION_REQUIRED/)
    f.runtime.state.failDelete = true
    await assert.rejects(f.files.cleanup(actor, before), /DELETE_FAILED/)
    assert.equal(await repository.countBy(actor), 2)
    f.runtime.state.failDelete = false
    assert.equal((await f.files.cleanup(actor, before)).removed, 1)
    assert.equal(await repository.countBy(actor), 1)
    assert.deepEqual(await f.files.read(actor, g.file), g.bytes)
    const transfers = db.getRepository(entities.LibraryTransferRecord)
    await transfers.update({ id: g.prepared.importId }, { updatedAt: old })
    assert.equal((await f.transfers.cleanup(f.context, before)).removed, 1)
    assert.equal((await f.transfers.commit(f.context, g.prepared.importId)).status, 'complete')
    assert.equal((await f.transfers.cleanup(f.context, before)).removed, 0)
  })
  await t.test('V2 view actions enforce schemas, allow read-only lists and resolve authorized ZIP grants', async () => {
    const f = services(db), g = await importGraph(f)
    const provider = new DashboardLibraryViewProvider(f.dashboards, null, null, f.catalog, f.transfers)
    const response = await provider.executeViewAction({ ...f.context, readonly: true }, 'data', 'resource-list', { input: {} })
    assert.equal(response.data.total, 4)
    await assert.rejects(provider.executeViewAction(f.context, 'data', 'resource-list', { input: { tenantId: 'injected' } }))
    const download = await provider.resolveViewFile(f.context, 'data', { purpose: 'download', fileKey: `library-v2/${g.taskRow.releaseId}` })
    assert.equal(download.mimeType, 'application/zip')
    const bytes = f.runtime.state.files.get(download.reference.filePath)
    assert.equal(decodePackage(bytes).resources.length, 4)
    await assert.rejects(provider.resolveViewFile({ ...f.context, userId: randomUUID() }, 'data', { purpose: 'download', fileKey: `library-v2/${g.taskRow.releaseId}` }), /DENIED/)
  })
})
