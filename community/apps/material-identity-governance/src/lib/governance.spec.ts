import { describe, expect, it } from 'vitest'
import { createDemoCase } from './demo-scenarios.js'
import {
  compareMaterial,
  goldenIdentity,
  assertEvidence,
} from './identity-rules.js'
import { applyDomainStep } from './governance-domain.js'
import { projectFlow } from './flow-projector.js'
import { templates } from './assistant-templates.js'
import { ROLES } from './roles.js'
import { parse } from 'yaml'
import type { GovernanceCase, RoleKey } from './contracts.js'
import { actionSchema, finalizeSchema } from './server/schemas.js'
const id = 'b48d3d68-d901-4c3f-8a3c-918083b75011'
function toReview(c: GovernanceCase) {
  let current = c
  for (let i = 0; i < 8; i++) {
    const n = projectFlow(current).nodes.find(
      (n) => n.executable && n.executionMode === 'assistant_task',
    )
    if (!n) break
    current = applyDomainStep(current, n.key, n.laneKey)
  }
  return current
}
describe('material identity hard rules', () => {
  it('normalizes units while retaining legitimate plant aliases', () => {
    const c = createDemoCase('duplicate_codes', id),
      [a, b] = c.materials
    expect(compareMaterial(a!, b!).hardFilterPassed).toBe(true)
    expect(goldenIdentity(a!)).toBe(goldenIdentity(b!))
    const original = structuredClone(c)
    const review = toReview(c)
    expect(c).toEqual(original)
    expect(review.proposal?.operation).toBe('map_aliases')
    expect(
      new Set(review.proposal?.mappings.map((m) => m.localCode)).size,
    ).toBe(2)
    expect(review.proposal?.goldenIds).toHaveLength(1)
  })
  it('rejects same-name same-code different technical identities', () => {
    const c = toReview(createDemoCase('code_collision', id))
    expect(c.criticalConflict).toBe(true)
    expect(c.candidates[0]?.hardFilterPassed).toBe(false)
    expect(c.proposal?.operation).toBe('split_identity')
    expect(c.proposal?.goldenIds).toHaveLength(2)
    expect(
      projectFlow(c).nodes.find((n) => n.key === 'contain-conflict')?.status,
    ).toBe('completed')
  })
  it('blocks a near match even when most attributes agree', () => {
    const [a, b] = createDemoCase('duplicate_codes', id).materials
    const near = structuredClone(b!)
    near.attributes = near.attributes.map((v) =>
      v.key === 'precision' ? { ...v, value: 'P0' } : v,
    )
    const match = compareMaterial(a!, near)
    expect(match.score).toBeGreaterThan(0.8)
    expect(match.hardFilterPassed).toBe(false)
    expect(goldenIdentity(a!)).not.toBe(goldenIdentity(near))
  })
  it('does not treat missing required attributes or empty drawings as equality', () => {
    const c = createDemoCase('duplicate_codes', id)
    const a = structuredClone(c.materials[0]!)
    a.attributes = []
    a.drawing = ''
    const b = structuredClone(a)
    expect(compareMaterial(a, b).relation).toBe('uncertain')
    expect(() => goldenIdentity(a)).toThrow('identity_evidence_incomplete')
  })
  it('checks candidate-only critical attributes symmetrically', () => {
    const [a, b] = createDemoCase('duplicate_codes', id).materials
    b!.attributes.push({
      key: 'coating',
      label: '涂层',
      value: 'Cr',
      unit: null,
      critical: true,
      evidenceIds: [],
    })
    expect(compareMaterial(a!, b!).hardFilterPassed).toBe(false)
    expect(compareMaterial(b!, a!).hardFilterPassed).toBe(false)
  })
  it('reuses an existing engineering material while retaining application evidence', () => {
    const c = toReview(createDemoCase('drawing_request', id))
    expect(c.proposal?.operation).toBe('reuse_existing')
    expect(c.proposal?.goldenIds).toHaveLength(1)
    expect(c.evidence.some((e) => e.system === 'PLM' && e.page === 1)).toBe(
      true,
    )
  })
})
describe('governed pipeline', () => {
  it('rejects changed sealed source evidence before intake', () => {
    const c = createDemoCase('duplicate_codes', id)
    c.materials[0]!.attributes[0]!.value = 'DC01'
    expect(() => applyDomainStep(c, 'collect-evidence', 'intake')).toThrow(
      'source_snapshot_changed',
    )
  })
  it('allows only the accountable ready role and does not count routers as LLM work', () => {
    const c = createDemoCase('code_collision', id)
    expect(() => applyDomainStep(c, 'collect-evidence', 'publisher')).toThrow(
      'node_not_executable',
    )
    expect(() =>
      applyDomainStep(c, 'match-identity', 'standardization'),
    ).toThrow('node_not_executable')
    const f = projectFlow(toReview(c))
    expect(
      f.nodes
        .filter((n) => n.kind !== 'task')
        .every((n) => n.executionMode === 'system'),
    ).toBe(true)
    expect(
      f.lanes.every((l) => !l.executions.length && !l.assistant.available),
    ).toBe(true)
  })
  it.each(['duplicate_codes', 'code_collision', 'drawing_request'] as const)(
    'requires current approval and two external confirmations: %s',
    (kind) => {
      const review = toReview(createDemoCase(kind, id))
      expect(review.status).toBe('review_required')
      expect(() =>
        applyDomainStep(review, 'publish-records', 'publisher'),
      ).toThrow()
      review.approval = {
        proposalRevision: 1,
        decision: 'approved',
        actor: 'human',
        reason: 'verified',
        at: new Date().toISOString(),
      }
      review.status = 'approved'
      expect(() =>
        applyDomainStep(review, 'publish-records', 'publisher'),
      ).toThrow('external_confirmation_required')
      review.publications = ['MDM', 'ERP'].map((system) => ({
        system,
        operationId: 'test-publish',
        status: 'confirmed',
        externalReference: 'mock-ack',
        errorCode: null,
        at: new Date().toISOString(),
      }))
      const done = applyDomainStep(review, 'publish-records', 'publisher')
      expect(done.status).toBe('completed')
      expect(projectFlow(done).executableNodeKeys).toHaveLength(0)
    },
  )
  it('blocks stale approval versions and fabricated evidence', () => {
    const c = toReview(createDemoCase('duplicate_codes', id))
    c.approval = {
      proposalRevision: 2,
      decision: 'approved',
      actor: 'human',
      reason: 'verified',
      at: new Date().toISOString(),
    }
    expect(() => applyDomainStep(c, 'publish-records', 'publisher')).toThrow()
    expect(() => assertEvidence(c, ['fabricated-id'])).toThrow(
      'invalid_evidence_reference',
    )
  })
  it('rejects caller-controlled scope and blank assessments', () => {
    expect(
      actionSchema.safeParse({
        action: 'coordinate',
        caseId: id,
        expectedRevision: 1,
        operationId: 'operation-test',
        tenantId: 'another-tenant',
      }).success,
    ).toBe(false)
    expect(
      finalizeSchema.safeParse({
        caseId: id,
        expectedRevision: 1,
        operationId: 'operation-test',
        assessment: 'ok',
        evidenceIds: [],
        changeSummary: 'test',
      }).success,
    ).toBe(false)
  })
})
describe('independent Assistant DSL', () => {
  it('has eight separate primary Agents with matching templates, openers and middleware ownership', () => {
    expect(templates).toHaveLength(8)
    for (const t of templates) {
      const d = parse(t.dslContent!),
        r = ROLES.find((r) => r.templateKey === t.key)!
      expect(d.team.name).toBe(t.key)
      expect(d.team.title).toBe(t.title)
      expect(d.team.avatar).toEqual(t.avatar)
      expect(d.team.features.opener.questions).toEqual(t.startPrompts)
      expect(
        d.nodes.filter((n: { type: string }) => n.type === 'agent'),
      ).toHaveLength(1)
      expect(d.team.agent.key).toBe(r.agentKey)
      expect(
        d.nodes.find((n: { type: string }) => n.type === 'agent').entity
          .leaderKey,
      ).toBeNull()
      expect(
        d.nodes.find((n: { type: string }) => n.type === 'workflow').entity
          .provider,
      ).toBe(r.middleware)
      expect(d.connections[0].required).toBe(true)
      expect(d.team.copilotModel).toBeNull()
      expect(d.team.options.dataXpert.roleKey).toBe(r.key)
    }
  })
})
