import { describe, it, expect } from 'vitest'
import { nodeWorkbench } from '../src/node-workbench'
import { project } from '../src/projection'
import { advance, pending, type Order } from '../src/domain'
import { configuration } from '../src/configuration'
const fixture = (): Order => ({
  id: 'sample',
  code: 'EM-SAMPLE',
  rule: 'R1',
  variant: 'shortage',
  mode: 'rehearsal',
  events: [],
})
describe('order workbench pages', () => {
  it('represents every configured node once, folding the two receipts under each human decision', () => {
    const book = nodeWorkbench(fixture()),
      tpl = configuration().template
    if (tpl.executionAuthority !== 'platform') throw Error()
    const keys = book.pages.flatMap((p) => [p.key, ...p.receipts.map((r) => r.key)])
    expect(keys.sort()).toEqual(tpl.nodes.map((n) => n.key).sort())
    expect(keys).toHaveLength(34)
    expect(book.pages.find((n) => n.key === 'commit')?.exits.map((e) => e.to)).toEqual([
      'build',
      'build',
      'build',
      'returned',
    ])
    const legacy = nodeWorkbench({ ...fixture(), variant: undefined })
    expect(legacy.pages).toHaveLength(16)
    expect(legacy.pages.some((p) => p.key === 'traceFork')).toBe(false)
  })
  it.each(['shortage', 'indexGap'] as const)(
    'keeps both evidence requests and the chosen route inspectable in %s',
    (variant) => {
      let order: Order = { ...fixture(), variant }
      while (pending(order)) {
        const step = pending(order)!
        if (step.key === 'cause') break
        order = advance(
          order,
          {
            operation: step.key,
            node: step.key,
            ...(step.kind === 'human'
              ? {
                  decision: 'approve' as const,
                  reason: 'reviewed',
                  ...(step.key === 'commit' ? { plan: 'split' as const } : {}),
                }
              : {}),
          },
          { id: 'operator', kind: step.kind === 'human' ? 'human' : 'sample_assistant' },
          '2026-01-01',
        )
      }
      const p = project(order),
        b = nodeWorkbench(order)
      expect(p.traceRoute).toBe(variant === 'shortage' ? 'matched' : 'lookup')
      expect(b.pages.find((x) => x.key === 'traceJoin')?.inputs).toEqual(['asBuilt', 'benchReport'])
      expect(b.pages.find((x) => x.key === 'traceJoin')?.controlState).toBe('done')
      expect(
        p.steps.find((x) => x.key === (variant === 'shortage' ? 'recoverReport' : 'expediteCheck'))?.event,
      ).toBeUndefined()
      expect(b.pages.find((x) => x.key === 'complete')?.controlState).toBe('queued')
      order = advance(
        order,
        { node: 'cause', operation: 'reject', decision: 'reject', reason: '需要再次拆检' },
        { id: 'reviewer', kind: 'human' },
        '2026-01-02',
      )
      const end = nodeWorkbench(order).pages.find((n) => n.key === 'returned')!
      expect(end.inputs).toEqual(['cause'])
      expect(end.controlState).toBe('done')
    },
  )
})
