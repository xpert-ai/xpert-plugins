import 'reflect-metadata'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import type { EntityManager, Repository } from 'typeorm'
import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { AssistantMiddlewareAccessRuntimeCapability, DefaultRuntimeCapabilityRegistry, type PluginContext } from '@xpert-ai/plugin-sdk'
import { Repositories } from '../src/repositories.js'
import { ReviewRepository, ReviewDelivery } from '../src/automation-entities.js'
import { WorkflowDiagnostics } from '../src/workflow-diagnostics.js'
import { WorkflowDiagnosis } from '../src/workflow-entity.js'
import type { ReviewPipelineCatalog } from '../src/pipeline/catalog.js'
import type { GitHubApp } from '../src/github-app.js'
import type { ReviewEvents } from '../src/event-subscription.js'
import type { Scope } from '../src/domain.js'
import { defaultPolicy } from '../src/automation-contract.js'

function fixture() {
  const principalUserId = randomUUID()
  const scope: Scope = { tenantId: randomUUID(), organizationId: randomUUID(), assistantId: randomUUID(), userId: randomUUID(), workspaceId: randomUUID(),
    permissions: [AIPermissionsEnum.XPERT_EDIT] }
  scope.assistant = { instanceId: scope.assistantId, currentId: scope.assistantId, versionIds: [scope.assistantId], principalUserId }
  const policy = Object.assign(new ReviewRepository(), scope, { id: randomUUID(), ownership: 'assistant', executionUserId: principalUserId,
    revision: 1, executionRevision: 1, installationId: '1', repositoryId: '2', owner: 'fixture', repository: 'repo', settings: { ...defaultPolicy, visibility: 'organization' } })
  const target = { projectId: randomUUID(), bindingId: randomUUID() }
  let workflowAccess = 0, projectAccess = 0, denied = false
  const registry = new DefaultRuntimeCapabilityRegistry()
  registry.register(AssistantMiddlewareAccessRuntimeCapability, { assertAccess: async ({ actor }) => { assert.equal(actor.userId, principalUserId) } })
  const events = { access: async (s: Scope) => { workflowAccess++; assert.equal(s.userId, principalUserId); if (denied) throw new Error('workflow_access_denied') },
    assertListening: async () => { if (denied) throw new Error('github_trigger_paused') }, activity: async () => {} } as unknown as ReviewEvents
  const records = { findOneBy: async () => policy, manager: { transaction: async (work: (m: EntityManager) => unknown) => work({
    update: async (_entity: unknown, _where: unknown, patch: Partial<ReviewRepository>) => { Object.assign(policy, patch); return { affected: 1 } },
    getRepository: () => ({ save: async () => {} })
  } as unknown as EntityManager) } } as unknown as Repository<ReviewRepository>
  const app = { inspect: async (_s: Scope, _owner: string, _repo: string, actions: boolean, checks: boolean) => {
    assert.equal(actions, true); assert.equal(checks, true)
    return { installationId: '1', repositoryId: '2', githubIntegrationId: randomUUID(), githubAppId: '3' }
  } } as unknown as GitHubApp
  const catalog = { validate: async (_s: Scope, binding: typeof target) => { projectAccess++; assert.deepEqual(binding, target) } } as unknown as ReviewPipelineCatalog
  const service = new Repositories(records, app, catalog, registry, events)
  const settings = { ...defaultPolicy, enabled: true, executionMode: 'pipeline' as const, pipeline: target, visibility: 'project' as const,
    onWorkflowFailure: true, onWorkflowTimeout: true, workflows: ['CI'] }
  return { service, policy, scope, settings, events, deny: () => { denied = true }, counts: () => ({ workflowAccess, projectAccess }) }
}

test('saving a PR pipeline preserves workflow opt-ins and validates both execution paths', async () => {
  const f = fixture()
  const saved = await f.service.save(f.scope, f.policy.id, 1, f.settings)
  assert.deepEqual(saved.settings, f.settings)
  assert.deepEqual(f.counts(), { workflowAccess: 1, projectAccess: 1 })
  assert.equal(saved.executionUserId, f.scope.assistant!.principalUserId)
  assert.equal(saved.revision, 2)
})

test('workflow access and pipeline binding checks still reject invalid combined rules', async () => {
  const f = fixture(); f.deny()
  await assert.rejects(f.service.save(f.scope, f.policy.id, 1, f.settings), /workflow_access_denied/)
  assert.equal(f.policy.revision, 1)
  await assert.rejects(f.service.save(f.scope, f.policy.id, 1, { ...f.settings, pipeline: null }), /pipeline_binding_required/)
  await assert.rejects(f.service.save(f.scope, f.policy.id, 0, f.settings), /revision_conflict/)
})

test('pipeline workflow delivery is deduplicated, Assistant-visible and still respects the trigger', async () => {
  const f = fixture()
  await f.service.save(f.scope, f.policy.id, 1, f.settings)
  const diagnoses: WorkflowDiagnosis[] = [], deliveries: ReviewDelivery[] = []
  const manager = {
    findOneOrFail: async () => f.policy,
    findOneBy: async (entity: unknown, where: Record<string, unknown>) => {
      const rows = entity === ReviewDelivery ? deliveries : diagnoses
      return rows.find(row => Object.entries(where).every(([key, value]) => Reflect.get(row, key) === value)) ?? null
    },
    create: (_entity: unknown, row: object) => ({ id: randomUUID(), ...row }),
    save: async (entity: unknown, row: WorkflowDiagnosis & ReviewDelivery) => {
      if (entity === ReviewDelivery) deliveries.push(row); else diagnoses.push(row)
      return row
    }, update: async () => ({ affected: 1 })
  } as unknown as EntityManager
  const records = { manager: { transaction: async (work: (m: EntityManager) => unknown) => work(manager) } } as unknown as Repository<WorkflowDiagnosis>
  const workflow = new WorkflowDiagnostics(records, f.service, f.events, {} as PluginContext)
  const policy = await f.service.execution(f.policy)
  const event = { action: 'completed', installation: { id: 1 }, repository: { id: 2 }, workflow_run: {
    id: 25, run_attempt: 1, head_sha: 'a'.repeat(40), head_branch: 'main', name: 'CI', conclusion: 'failure', status: 'completed', html_url: 'https://github.com/fixture/repo/actions/runs/25' } }
  await workflow.receive(policy, event, 'delivery-1', 'digest')
  await workflow.receive(policy, event, 'delivery-1', 'digest')
  await workflow.receive(policy, event, 'delivery-2', 'digest')
  assert.equal(diagnoses.length, 1)
  assert.equal(diagnoses[0].status, 'queued')
  assert.equal(diagnoses[0].organizationShared, true)
  assert.equal(diagnoses[0].userId, f.scope.assistant!.principalUserId)
  assert.equal(diagnoses[0].settings.executionMode, 'pipeline')
  f.deny()
  await workflow.receive(policy, { ...event, workflow_run: { ...event.workflow_run, run_attempt: 2 } }, 'delivery-3', 'digest-2')
  assert.equal(diagnoses[1].status, 'skipped')
  assert.equal(diagnoses[1].reason, 'github_trigger_paused')
})
