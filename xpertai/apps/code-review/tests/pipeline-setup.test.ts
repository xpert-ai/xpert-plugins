import 'reflect-metadata'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { configureProjectPipelineFromForm, type ProjectPipelineSavedConfiguration } from '@xpert-ai/contracts'
import { DefaultRuntimeCapabilityRegistry, ProjectAccessRuntimeCapability, ProjectPipelineCatalogRuntimeCapability } from '@xpert-ai/plugin-sdk'
import { ReviewPipelineCatalog } from '../src/pipeline/catalog.js'
import { ReviewPipelineContribution } from '../src/pipeline/configuration.js'
import { reviewPipelineConfigureSchema, reviewPipelineSetupSchema } from '../src/pipeline/setup-contract.js'
import type { Scope } from '../src/domain.js'

function fixture() {
  const capabilities = new DefaultRuntimeCapabilityRegistry(), contribution = new ReviewPipelineContribution()
  const s: Scope = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID(), assistantId: randomUUID(), workspaceId: randomUUID() }
  const projectId = randomUUID(), saved = new Map<string, ProjectPipelineSavedConfiguration>()
  let allowed = true, configured = 0
  capabilities.register(ProjectAccessRuntimeCapability, {
    async listReadable() { return [] }, async assertEdit() { throw new Error('unused') },
    async assertManage(c) {
      assert.equal(c.projectId, projectId); assert.equal(c.actor.tenantId, s.tenantId); assert.equal(c.actor.userId, s.userId)
      if (!allowed) throw new Error('access_denied')
      return { projectId, role: 'owner', canManage: true, archived: false }
    }
  })
  capabilities.register(ProjectPipelineCatalogRuntimeCapability, {
    async list() { return { canManage: true, assistants: [{ id: s.assistantId, name: 'Reviewer', publishedVersion: '2' }],
      items: contribution.configurations.map(configuration => ({ contributionKey: contribution.key, configuration,
        form: contribution.forms.find(form => form.templateRef === configuration.binding.templateRef) })) } },
    async configure(_context, input) {
      const prior = saved.get(input.requestId)
      if (prior) return { bindingId: prior.id, revision: 1, definitionDigest: 'a'.repeat(64) }
      const source = contribution.configurations.find(item => item.binding.templateRef === input.templateRef)!
      const form = contribution.forms.find(item => item.templateRef === input.templateRef)!
      const configuration = configureProjectPipelineFromForm(source, form, input)
      saved.set(input.requestId, { id: input.requestId, revision: 1, createdAt: new Date().toISOString(), configuration }); configured++
      return { bindingId: input.requestId, revision: 1, definitionDigest: 'a'.repeat(64) }
    },
    async binding(_context, id) { const result = saved.get(id); if (!result) throw new Error('missing'); return result },
    async bindings() { return { items: [...saved.values()], next: null } }
  })
  return { catalog: new ReviewPipelineCatalog(capabilities), s, projectId, saved, configured: () => configured,
    revoke: () => { allowed = false } }
}

test('template selection works with no saved configuration and filters by explicit source', async () => {
  const f = fixture()
  assert.equal(f.saved.size, 0)
  const catalog = await f.catalog.list(f.s, f.projectId, 'github')
  assert.deepEqual(catalog.templates.map(item => item.templateRef), ['code-review.pull-request@1.0.0', 'code-review.pull-request-light@1.0.0'])
  assert.equal(catalog.defaultAssistantId, f.s.assistantId)
  assert.equal(catalog.templates[0].assistantSlots.length, 3)
  assert.equal(catalog.templates[1].assistantSlots.length, 1)
  const local = await f.catalog.list(f.s, f.projectId, 'local_git')
  assert.deepEqual(local.templates.map(item => item.templateRef), ['code-review.local-git@1.0.0'])
})
test('inline configuration uses the registered template and returns a reusable binding with retry identity', async () => {
  const f = fixture(), requestId = randomUUID()
  const input = { requestId, sourceKind: 'github' as const, contributionKey: 'code-review', templateRef: 'code-review.pull-request-light@1.0.0',
    assistants: { correctness: f.s.assistantId }, parameters: { requireChecks: false, requiredChecks: ['unit'], blockingPriorities: ['P0' as const] } }
  const result = await f.catalog.configure(f.s, f.projectId, input)
  assert.deepEqual(result, { projectId: f.projectId, bindingId: requestId })
  assert.deepEqual(await f.catalog.configure(f.s, f.projectId, input), result)
  assert.equal(f.configured(), 1)
  const config = f.saved.get(result.bindingId)!.configuration
  assert.equal(config.binding.executorBindings?.correctness.selectionKey, f.s.assistantId)
  assert.deepEqual(config.binding.parameters, input.parameters)
  assert(config.template.nodes.some(node => node.kind === 'human_gate'))
  assert.equal(config.binding.executorBindings?.security, undefined)
})
test('inline setup rejects source mismatch, unregistered versions, unauthorized Assistants and topology overrides', async () => {
  const f = fixture()
  const input = { requestId: randomUUID(), sourceKind: 'github' as const, contributionKey: 'code-review', templateRef: 'code-review.pull-request-light@1.0.0',
    assistants: { correctness: f.s.assistantId }, parameters: { requireChecks: true, requiredChecks: [], blockingPriorities: ['P0' as const] } }
  await assert.rejects(f.catalog.configure(f.s, f.projectId, { ...input, templateRef: 'code-review.local-git@1.0.0' }), /pipeline_template_unavailable/)
  await assert.rejects(f.catalog.configure(f.s, f.projectId, { ...input, templateRef: 'code-review.pull-request-light@9.0.0' }), /pipeline_template_unavailable/)
  await assert.rejects(f.catalog.configure(f.s, f.projectId, { ...input, contributionKey: 'another-plugin' }), /pipeline_template_unavailable/)
  await assert.rejects(f.catalog.configure(f.s, f.projectId, { ...input, assistants: { correctness: randomUUID() } }), /pipeline_assistant_required/)
  await assert.rejects(f.catalog.configure(f.s, f.projectId, { ...input, assistants: { correctness: f.s.assistantId, owner: f.s.assistantId } }), /pipeline_assistant_required/)
  assert.equal(reviewPipelineConfigureSchema.safeParse({ ...input, configuration: { nodes: [] } }).success, false)
  assert.equal(reviewPipelineSetupSchema.safeParse({ ...input, parameters: { ...input.parameters, blockingPriorities: [] } }).success, false)
  assert.equal(f.configured(), 0)
  f.revoke()
  await assert.rejects(f.catalog.configure(f.s, f.projectId, input), /access_denied/)
})
