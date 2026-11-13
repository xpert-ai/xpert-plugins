import test from 'node:test'
import assert from 'node:assert/strict'
import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { RoadEventCommandCenterDraftService } from '../dist/lib/road-event-command-center-draft.service.js'
import { RoadEventDraftRecord } from '../dist/lib/road-event-command-center-draft.entity.js'

const scope = {
  tenantId: 'tenant-db',
  organizationId: 'organization-db',
  workspaceId: 'workspace-db',
  userId: 'user-db',
  xpertId: 'assistant-db'
}

const draft = {
  title: 'G312 road obstruction',
  eventType: 'road_blockage',
  severity: 'high',
  locationDescription: 'G312 kilometer 126 eastbound',
  description: 'Loose debris blocks the right lane. No collision has been reported.',
  occurredAt: '2026-11-10T11:20:00.000Z'
}

test('TypeORM persists and scopes road-event drafts in a relational database', async () => {
  const dataSource = await new DataSource({
    type: 'sqljs',
    autoSave: false,
    entities: [RoadEventDraftRecord],
    synchronize: true
  }).initialize()

  try {
    const repository = dataSource.getRepository(RoadEventDraftRecord)
    const firstService = new RoadEventCommandCenterDraftService(repository)
    assert.deepEqual(await firstService.get(scope), { revision: 0, draft: null, updatedAt: null })

    const receipt = await firstService.save(scope, { expectedRevision: 0, draft })
    assert.equal(receipt.revision, 1)

    // A newly constructed service reads back the committed row rather than UI memory.
    const nextService = new RoadEventCommandCenterDraftService(repository)
    const restored = await nextService.get(scope)
    assert.equal(restored.revision, 1)
    assert.deepEqual(restored.draft, draft)
    assert.equal(restored.updatedAt, receipt.updatedAt)
    assert.equal((await nextService.get({ ...scope, userId: 'another-user' })).draft, null)

    const updated = await nextService.save(scope, { expectedRevision: 1, draft: { ...draft, severity: 'critical' } })
    assert.equal(updated.revision, 2)
    await assert.rejects(nextService.save(scope, { expectedRevision: 1, draft }), /conflict/)

    const recommendation = {
      summary: 'Protect the blocked lane and verify that all road users are safe.',
      severity: 'high',
      actions: [{ title: 'Secure the scene', details: 'Set up traffic control and confirm whether anyone is injured.', priority: 'immediate' }],
      cautions: ['Confirm the current conditions with an on-scene report.'],
      generatedAt: '2026-11-11T10:00:00.000Z',
      model: 'test-model'
    }
    const withRecommendation = {
      ...draft,
      severity: 'critical',
      recommendation,
      recommendationAttempt: { status: 'succeeded', attemptedAt: '2026-11-11T10:00:00.000Z' }
    }
    const recommendationSaved = await nextService.save(scope, { expectedRevision: 2, draft: withRecommendation })
    assert.equal(recommendationSaved.revision, 3)

    const confirmed = await nextService.confirmRecommendation(scope, 3)
    assert.equal(confirmed.revision, 4)
    assert.equal(confirmed.confirmation.status, 'confirmed')
    assert.equal(confirmed.confirmation.confirmedBy, scope.userId)
    assert.ok(confirmed.confirmation.confirmedAt)
    assert.deepEqual((await new RoadEventCommandCenterDraftService(repository).get(scope)).draft.confirmation, confirmed.confirmation)

    const noOpSave = await nextService.save(scope, { expectedRevision: 4, draft: withRecommendation })
    assert.equal(noOpSave.revision, 5)
    assert.deepEqual((await nextService.get(scope)).draft.confirmation, confirmed.confirmation)

    const duplicateConfirmation = await nextService.confirmRecommendation(scope, 5)
    assert.equal(duplicateConfirmation.revision, 5)
    assert.deepEqual(duplicateConfirmation.confirmation, confirmed.confirmation)

    const edited = await nextService.save(scope, {
      expectedRevision: 5,
      draft: { ...withRecommendation, description: 'The right lane is now reopened after debris removal.' }
    })
    assert.equal(edited.revision, 6)
    const afterEdit = await nextService.get(scope)
    assert.equal(afterEdit.draft.recommendation, null)
    assert.equal(afterEdit.draft.recommendationAttempt, null)
    assert.equal(afterEdit.draft.confirmation, null)
  } finally {
    await dataSource.destroy()
  }
})
