import 'reflect-metadata'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { ForbiddenException } from '@nestjs/common'
import { DefaultRuntimeCapabilityRegistry, ProjectAccessRuntimeCapability } from '@xpert-ai/plugin-sdk'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { DataSource } from 'typeorm'
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest'
import { MaterialCaseService } from './case.service.js'
import { MaterialProfileService, profileScope } from './profile.service.js'
import { MaterialProfileProvider } from './profile.provider.js'
import { PROFILE_TABS, PROFILE_FEATURE, profileManifests } from './profile.views.js'
import { MATERIAL_ENTITIES, MaterialCaseEntity, MaterialMutationEntity } from './entities.js'
import { createDemoCase } from '../demo-scenarios.js'
import { projectFlow } from '../flow-projector.js'
import { applyDomainStep } from '../governance-domain.js'
import { ROLES } from '../roles.js'
const envFile = process.env.MATERIAL_PROFILE_TEST_ENV_FILE
const tab = (role: string, mode = 'recent') => PROFILE_TABS.find(t => t.role === role && t.mode === mode)!.key

describe('Profile manifest contracts', () => {
  it('gates all eight role profiles and keeps human decisions in coordinator/governance views', () => {
    const manifests = profileManifests()
    expect(manifests).toHaveLength(16)
    for (const role of ROLES) {
      const views = manifests.filter(m => m.activation?.requiredFeatures?.includes(role.feature))
      expect(views).toHaveLength(2)
      for (const view of views) {
        expect(view.slot).toBe('agent.profile.tabs')
        expect(view.activation?.requiredFeatures).toEqual([PROFILE_FEATURE, role.feature])
        expect(view.actions?.length).toBe(['coordinator', 'governance'].includes(role.key) ? 1 : 0)
      }
    }
  })
})
describe.skipIf(!envFile)('Material Profile PostgreSQL access and human decisions', () => {
  const schema = `material_profile_test_${randomUUID().replaceAll('-', '')}`
  let admin: DataSource, db: DataSource, cases: MaterialCaseService, profiles: MaterialProfileService
  const registry = new DefaultRuntimeCapabilityRegistry()
  const projectId = randomUUID()
  let caseId = ''
  const context = (assistantId = 'governance-a', overrides: Partial<XpertResolvedViewHostContext> = {}): XpertResolvedViewHostContext => ({
    tenantId: 'tenant-a', organizationId: 'org-a', userId: 'owner', hostType: 'agent', hostId: assistantId, slots: [],
    assistant: { instanceId: assistantId, currentId: assistantId, versionIds: [assistantId, `${assistantId}-published`] }, ...overrides,
  })
  beforeAll(async () => {
    const env = Object.fromEntries(readFileSync(envFile!, 'utf8').split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => {const split = line.indexOf('=');return [line.slice(0, split), line.slice(split+1).trim().replace(/^['"]|['"]$/g, '')]}))
    const connection = { type: 'postgres' as const, host: env.DB_HOST || 'localhost', port: Number(env.DB_PORT || 5432), username: env.DB_USER, password: env.DB_PASS, database: env.DB_NAME }
    admin = await new DataSource(connection).initialize()
    await admin.query(`CREATE SCHEMA "${schema}"`)
    db = await new DataSource({ ...connection, schema, extra: { options: `-c search_path=${schema},public` }, entities: MATERIAL_ENTITIES, synchronize: true }).initialize()
    registry.register(ProjectAccessRuntimeCapability, {
      async listReadable({ actor }) {
        if (actor.tenantId !== 'tenant-a' || actor.organizationId !== 'org-a' || actor.userId === 'outsider') return []
        return [{ projectId, role: actor.userId === 'editor' ? 'editor' : actor.userId === 'member' ? 'member' : 'owner', canManage: actor.userId === 'owner', archived: false, assistantIds: ['governance-a-published', 'coordinator-a'] }]
      },
      async assertManage({ actor }) { const access = (await this.listReadable({ actor }))[0]; if (!access?.canManage) throw new ForbiddenException('project_manage_required'); return access },
      async assertEdit({ actor }) { const access = (await this.listReadable({ actor }))[0]; if (!access || access.role === 'member') throw new ForbiddenException(); return access },
    })
    cases = new MaterialCaseService(db, registry, { createScopedApi: () => { throw new Error('No model runtime in PostgreSQL approval tests') } })
    profiles = new MaterialProfileService(cases)
  }, 30000)
  afterAll(async () => { await db?.destroy(); if (admin?.isInitialized) { await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.destroy() } })
  beforeEach(async () => {
    for (const entity of MATERIAL_ENTITIES) await db.getRepository(entity).clear()
    caseId = randomUUID()
    let snapshot = createDemoCase('duplicate_codes', caseId)
    for (let i = 0; i < 8; i++) { const node = projectFlow(snapshot).nodes.find(node => node.executable && node.executionMode === 'assistant_task'); if (!node) break; snapshot = applyDomainStep(snapshot, node.key, node.laneKey) }
    const e = db.getRepository(MaterialCaseEntity).create({ id: caseId, tenantId: 'tenant-a', organizationId: 'org-a', scopeKey: 'tenant-a:org-a', caseKey: snapshot.caseKey, title: snapshot.title, kind: snapshot.kind, status: snapshot.status, revision: snapshot.revision, snapshot, projectId, projectStatus: 'ready', assignedAssistantIds: ['governance-a-published', 'coordinator-a'], coordinatorId: 'coordinator-a', createdById: 'owner', autoRun: false, criticalConflict: false, exposure: 100 })
    await db.getRepository(MaterialCaseEntity).save(e)
  })
  it('filters exact instances, version families, tenant, organization and readable projects before totals and detail', async () => {
    expect((await profiles.getData(context(), tab('governance'), {})).total).toBe(1)
    for (const c of [context('governance-b'), context('governance-a', { userId: 'outsider' }), context('governance-a', { tenantId: 'tenant-b' }), context('governance-a', { organizationId: 'org-b' })]) {
      expect((await profiles.getData(c, tab('governance'), {})).total).toBe(0)
      await expect(profiles.getData(c, tab('governance'), { selectionId: caseId })).rejects.toThrow()
    }
    expect(() => profileScope(context('governance-a', { assistant: undefined }))).toThrow()
  })
  it('only managers can approve; editor/member cannot submit guessed targets', async () => {
    const input = { caseId, expectedRevision: 8, operationId: randomUUID(), decision: 'approved' as const, reason: 'Reviewed exact evidence and proposal' }
    for (const userId of ['editor', 'member']) {
      const c = context('governance-a', { userId })
      expect((await profiles.getData(c, tab('governance'), { selectionId: caseId })).selected?.case.allowedActions).toEqual([])
      await expect(profiles.decide(c, tab('governance'), input)).rejects.toThrow()
    }
    expect(await db.getRepository(MaterialMutationEntity).count()).toBe(0)
  })
  it('rejects stale revisions and role actions; records approval once with unchanged retry payload', async () => {
    const input = { caseId, expectedRevision: 8, operationId: randomUUID(), decision: 'approved' as const, reason: 'Reviewed exact evidence and proposal' }
    await expect(profiles.decide(context(), tab('governance'), { ...input, expectedRevision: 7 })).rejects.toThrow()
    await expect(profiles.decide(context(), tab('quality'), input)).rejects.toThrow()
    const receipt = await profiles.decide(context(), tab('governance'), input)
    expect(await profiles.decide(context(), tab('governance'), input)).toEqual(receipt)
    expect(await db.getRepository(MaterialMutationEntity).count()).toBe(1)
    const entity = await db.getRepository(MaterialCaseEntity).findOneByOrFail({ id: caseId })
    expect(entity.snapshot.approval?.actor).toBe('owner')
    expect(entity.status).toBe('approved')
    expect(entity.autoRun).toBe(false)
    expect((await profiles.getData(context(), tab('governance', 'attention'), {})).total).toBe(0)
  })
  it('rejects lost instance assignment inside the locked approval transaction', async () => {
    const scope = profileScope(context())
    await db.getRepository(MaterialCaseEntity).update(caseId, { assignedAssistantIds: ['governance-b'] })
    await expect(cases.decide(scope, { caseId, expectedRevision: 8, operationId: randomUUID(), decision: 'approved', reason: 'No longer assigned' })).rejects.toThrow('profile_case_forbidden')
  })
  it('persists rejection without publication and rejects undeclared actions', async () => {
    await profiles.decide(context(), tab('governance'), { caseId, expectedRevision: 8, operationId: randomUUID(), decision: 'rejected', reason: 'Need more source evidence' })
    const entity = await db.getRepository(MaterialCaseEntity).findOneByOrFail({ id: caseId })
    expect(entity.status).toBe('rejected'); expect(entity.snapshot.publications).toHaveLength(0)
    const provider = new MaterialProfileProvider(profiles)
    expect((await provider.executeViewAction(context(), tab('governance'), 'publish_records', {})).success).toBe(false)
  })
})
