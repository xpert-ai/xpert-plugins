import { describe, expect, it } from 'vitest'
import { createDemoCase } from './demo-scenarios.js'
import { applyDomainStep } from './governance-domain.js'
import { canonicalJson, sourceSnapshotHash } from './source-snapshot.js'

describe('released source integrity across JSONB persistence', () => {
  it.each(['duplicate_codes', 'code_collision', 'drawing_request'] as const)(
    '%s survives reordered JSON object keys',
    (kind) => {
      const original = createDemoCase(kind, 'snapshot-roundtrip')
      const persisted = JSON.parse(canonicalJson(original)) as typeof original
      expect(JSON.stringify(persisted.materials)).not.toBe(
        JSON.stringify(original.materials),
      )
      expect(sourceSnapshotHash(persisted)).toBe(original.sourceSnapshotHash)
      expect(
        applyDomainStep(persisted, 'collect-evidence', 'intake').revision,
      ).toBe(2)
      persisted.materials[0]!.code += '-tampered'
      expect(() =>
        applyDomainStep(persisted, 'collect-evidence', 'intake'),
      ).toThrow('source_snapshot_changed')
    },
  )
  it('preserves array order and distinguishes null, strings and numbers', () => {
    expect(canonicalJson({ b: 2, a: [1, '1', null] })).toBe(
      canonicalJson({ a: [1, '1', null], b: 2 }),
    )
    expect(canonicalJson([1, '1'])).not.toBe(canonicalJson(['1', 1]))
  })
})
