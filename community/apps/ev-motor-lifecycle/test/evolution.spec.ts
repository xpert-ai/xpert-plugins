import 'reflect-metadata'
import { describe, expect, it, vi } from 'vitest'
import { MotorEvolution } from '../src/evolution'
import { digest } from '../src/digest'
import { replay } from '../src/sample'
import type { EvolutionChangeOperation } from '@xpert-ai/contracts'
import type { MotorRuntime } from '../src/runtime'

function fixture() {
  const facts = [{ label: '样本', value: '合同条款' }]
  const row = {
    id: 'order-1',
    ownerId: 'reviewer-a',
    tenantId: 'tenant-a',
    organizationId: 'org-a',
    data: {
      rule: 'R1',
      events: [{ node: 'replay', operation: 'replay-1', at: '2026-06-01T00:00:00Z', facts }],
    },
  }
  const baseline = { resourceId: row.id, version: 'R1', hash: digest({ rule: 'R1', grammar: 'first_ip' }) }
  const evidence = [
    {
      kind: 'artifact',
      subjectKey: row.id,
      uri: 'motor-order:order-1/replay',
      version: 'replay-1',
      hash: digest([['样本', '合同条款']]),
    },
  ]
  const scope = { type: 'organization', key: row.organizationId, dimensions: { order: row.id } }
  const op = {
    context: {
      tenantId: row.tenantId,
      organizationId: row.organizationId,
      targetId: 'ev_motor.contract_requirement',
      scope,
      actor: { actorType: 'human', actorId: row.ownerId },
    },
    change: {
      requestId: row.id,
      changeId: 'change-1',
      targetId: 'ev_motor.contract_requirement',
      createdBy: row.ownerId,
      scope,
      baseline,
      evidence,
      evidenceHash: digest(evidence),
    },
  } as unknown as EvolutionChangeOperation
  const update = vi.fn().mockResolvedValue({ affected: 1 })
  const provider = new MotorEvolution({
    store: { db: { getRepository: () => ({ findOneByOrFail: async () => row, update }) } },
  } as unknown as MotorRuntime)
  return { op, provider, update }
}
describe('contract rule publication', () => {
  it('checks every labeled example, then binds publication to the reviewed candidate, dataset and run', async () => {
    const { op, provider, update } = fixture()
    const built = await provider.prepare(op)
    op.change.candidate = { ...built, artifact: built.artifact } as typeof op.change.candidate
    const evaluation = await provider.evaluate(op)
    expect(evaluation.checks).toHaveLength(6)
    expect(evaluation.passed).toBe(true)
    expect(evaluation.datasetHash).toBe(digest(replay()))
    op.change.evaluation = evaluation
    await expect(provider.publish(op)).rejects.toThrow('tested_approval_required')
    op.change.approval = {
      decision: 'approved',
      approvalId: 'approval-1',
      candidateHash: built.artifact.hash,
      evaluationRunId: evaluation.runId,
      decidedAt: '2026-06-02T00:00:00Z',
    } as typeof op.change.approval
    const receipt = await provider.publish(op)
    expect(receipt.resource.version).toBe('R2')
    expect(receipt).toEqual(await provider.publish(op))
    expect(update).toHaveBeenCalledWith(
      { id: 'order-1', tenantId: 'tenant-a', organizationId: 'org-a' },
      { evolutionReceipt: receipt },
    )
    op.change.evaluation = { ...evaluation, datasetHash: 'different' }
    await expect(provider.publish(op)).rejects.toThrow('tested_approval_required')
  })
  it('refuses different scopes, substituted evidence and an unassigned publication actor', async () => {
    const { op, provider } = fixture()
    await expect(
      provider.prepare({ ...op, context: { ...op.context, organizationId: 'other' } }),
    ).rejects.toThrow('evolution_scope_mismatch')
    await expect(provider.evaluate({ ...op, change: { ...op.change, evidence: [] } })).rejects.toThrow(
      'evolution_evidence_mismatch',
    )
    await expect(
      provider.authorizePublication({
        ...op,
        context: { ...op.context, actor: { ...op.context.actor, actorId: 'someone-else' } },
      }),
    ).rejects.toThrow('order_reviewer_required')
  })
})
