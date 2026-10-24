import { describe, expect, it } from 'vitest'
import { materialConfiguration, materialDescriptors, steps } from './configuration.js'
describe('platform-managed business topology', () => {
  it('owns all execution through a bounded native DAG and versioned adapters', () => {
    const config = materialConfiguration()
    expect(config.template.executionAuthority).toBe('platform')
    if (config.template.executionAuthority !== 'platform') throw Error('platform_required')
    const refs = new Set(materialDescriptors.map(d => d.ref))
    expect(refs.has(config.template.subjectResolverRef)).toBe(true)
    for (const n of config.template.nodes) {
      if (n.kind === 'work') { expect(refs.has(n.operationRef)).toBe(true); expect(n.completionRef).toBe('platform.output-validated@1') }
      if (n.kind === 'human_gate') { expect(n.outputPorts?.decision).toBe('platform.human-decision@1'); expect(n.outcomes).toEqual(['approved','rejected']) }
    }
    expect(config.template.nodes.filter(n => n.kind === 'human_gate')).toHaveLength(1)
    for (const [nodeKey,role] of steps) {
      expect(config.template.nodes).toContainEqual(expect.objectContaining({ key: nodeKey, kind: 'work', executorSlot: role }))
      expect(config.binding.executorBindings?.[role]?.kind).toBe('assistant')
    }
    expect(config.template.failurePolicy.unknownExecution).toBe('inspect_without_replay')
  })
})
