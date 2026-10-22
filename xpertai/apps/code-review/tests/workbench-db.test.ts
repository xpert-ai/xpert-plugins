import 'reflect-metadata'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { DataSource, Table } from 'typeorm'
import {
  DefaultRuntimeCapabilityRegistry,
  ProjectAccessRuntimeCapability,
  type PluginContext
} from '@xpert-ai/plugin-sdk'
import { Review } from '../src/entity.js'
import { ReviewRepository, ReviewRun, ReviewDelivery } from '../src/automation-entities.js'
import { Reviews } from '../src/backend.js'
import { Repositories } from '../src/repositories.js'
import { Automation } from '../src/automation.js'
import { ReviewWorkbench } from '../src/workbench.js'
import { workbenchQuerySchema } from '../src/workbench-contract.js'
import { defaultPolicy } from '../src/automation-contract.js'
import type { GitHubApp } from '../src/github-app.js'
import type { ReviewPipelineCatalog } from '../src/pipeline/catalog.js'
import type { ReviewPipelineAutomation } from '../src/pipeline/automation.js'
import type { Scope, Snapshot } from '../src/domain.js'
const url = process.env.XPERT_PIPELINE_TEST_DATABASE_URL
if (url && !/^\/xpert_pipeline_test_[a-z0-9_]+$/.test(new URL(url).pathname))
  throw new Error('Dedicated pipeline test database required')
test(
  'workbench groups authorized root records with stable history, filters and scope isolation',
  { skip: !url },
  async (t) => {
    const schema = `code_review_workbench_${randomUUID().replaceAll('-', '')}`
    const db = new DataSource({
      type: 'postgres',
      url,
      schema,
      entities: [Review, ReviewRepository, ReviewRun, ReviewDelivery],
      uuidExtension: 'pgcrypto',
      extra: { options: `-c search_path=${schema},public` }
    })
    await db.initialize()
    await db.query(`CREATE SCHEMA "${schema}"`)
    t.after(async () => {
      await db.query(`DROP SCHEMA "${schema}" CASCADE`)
      await db.destroy()
    })
    const qr = db.createQueryRunner()
    for (const entity of [Review, ReviewRepository, ReviewRun, ReviewDelivery])
      await qr.createTable(Table.create(db.getMetadata(entity), db.driver))
    await qr.release()
    const s: Scope = {
      tenantId: randomUUID(),
      organizationId: randomUUID(),
      userId: randomUUID(),
      assistantId: randomUUID(),
      workspaceId: randomUUID()
    }
    const projectId = randomUUID(),
      capability = new DefaultRuntimeCapabilityRegistry()
    capability.register(ProjectAccessRuntimeCapability, {
      async listReadable() {
        return []
      },
      async assertEdit() {
        return { projectId, role: 'owner', canManage: true, archived: false }
      },
      async assertManage(c) {
        return this.assertEdit(c)
      }
    })
    const repositories = new Repositories(
      db.getRepository(ReviewRepository),
      {} as GitHubApp,
      {} as ReviewPipelineCatalog,
      capability
    )
    const reviews = new Reviews(db.getRepository(Review), {} as PluginContext, repositories, capability)
    const automation = new Automation(
      db.getRepository(ReviewRun),
      db.getRepository(ReviewDelivery),
      repositories,
      reviews,
      {} as PluginContext,
      {} as ReviewPipelineAutomation
    )
    const workbench = new ReviewWorkbench(reviews, automation),
      page = (input: Record<string, unknown> = {}, scope = s) =>
        workbench.page(scope, workbenchQuerySchema.parse(input))
    const policy = await db
      .getRepository(ReviewRepository)
      .save({
        ...s,
        installationId: '1',
        repositoryId: '1',
        owner: 'fixture',
        repository: 'repo',
        settings: defaultPolicy
      })
    const snapshot: Snapshot = {
      title: 'First snapshot',
      body: '',
      url: 'https://github.com/fixture/repo/pull/1',
      state: 'open',
      author: 'fixture',
      headSha: 'a'.repeat(40),
      baseSha: 'b'.repeat(40),
      files: [],
      comments: [],
      checks: [],
      warnings: [],
      fetchedAt: new Date().toISOString()
    }
    const manual = await db
      .getRepository(Review)
      .save({
        ...s,
        ref: { provider: 'github' as const, owner: 'fixture', repository: 'repo', number: 1 },
        snapshot,
        createdAt: new Date('2026-01-01'),
        pinned: true
      })
    await db
      .getRepository(Review)
      .save({ ...s, ref: manual.ref, snapshot, pipelineRootReviewId: randomUUID(), createdAt: new Date('2026-01-04') })
    const run = await db
      .getRepository(ReviewRun)
      .save({
        tenantId: s.tenantId,
        organizationId: s.organizationId,
        assistantId: s.assistantId,
        repositoryPolicyId: policy.id,
        operationKey: '1',
        number: 1,
        headSha: 'c'.repeat(40),
        title: 'Literal 100% review',
        trigger: 'opened',
        status: 'running',
        policyRevision: 1,
        settings: defaultPolicy,
        notBefore: new Date(),
        createdAt: new Date('2026-01-03')
      })
    const result = await page()
    assert.equal(result.total, 1)
    assert.equal(result.items[0].count, 2)
    assert.equal(result.items[0].id, run.id)
    assert.equal((await page({ history: result.items[0].key })).items.length, 2)
    assert.equal((await page({ recordId: manual.id })).items[0].id, manual.id)
    assert.equal((await page({ pinned: true })).total, 1)
    assert.equal((await page({ status: 'ready' })).total, 0, 'status applies to latest record, not stale history')
    assert.equal((await page({ search: '100%' })).total, 1)
    assert.equal((await page({ search: '100_' })).total, 0, 'wildcards are literal user input')
    assert.equal((await page({ search: "%' OR 1=1 --" })).total, 0)
    assert.equal((await page({ repository: 'FIXTURE/REPO' })).total, 1)
    assert.equal((await page({}, { ...s, userId: randomUUID() })).total, 0)
    assert.equal((await page({}, { ...s, tenantId: randomUUID() })).total, 0)
    assert.equal((await page({}, { ...s, organizationId: randomUUID() })).total, 0)
    assert.equal((await page({}, { ...s, assistantId: randomUUID() })).total, 0)
    // Sharing a repository now must not reveal old private runs to a different user.
    const sharedSettings = {
      ...defaultPolicy,
      visibility: 'project' as const,
      pipeline: { projectId, bindingId: randomUUID() }
    }
    await db.getRepository(ReviewRepository).update(policy.id, { settings: sharedSettings })
    const other = { ...s, userId: randomUUID(), runtime: { projectId } }
    assert.equal((await page({}, other)).total, 0)
    await db
      .getRepository(ReviewRun)
      .save({
        ...run,
        id: randomUUID(),
        operationKey: 'shared',
        settings: sharedSettings,
        createdAt: new Date('2026-01-05')
      })
    const shared = await page({}, other)
    assert.equal(shared.total, 1)
    assert.equal(shared.items[0].count, 1)
  }
)
