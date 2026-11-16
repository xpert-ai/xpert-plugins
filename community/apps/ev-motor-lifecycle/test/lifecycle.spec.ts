import { readFileSync } from 'node:fs'
import { MotorRuntime } from '../src/runtime'
import { MotorOrder } from '../src/entity'
import { readySteps } from '../src/domain'
import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { advance, pending, successor, status, type Order, type Command, type Actor } from '../src/domain'
import { project } from '../src/projection'
import { legacyFlow as flow, roles } from '../src/process'
import { plans, replay, score, extract } from '../src/sample'
import { configuration, MotorContribution } from '../src/configuration'
import { checkProjectPipelineConfiguration } from '@xpert-ai/contracts'
import { templates, suiteRoles } from '../src/catalog'
import { parse } from 'yaml'
const order = (): Order => ({
  id: randomUUID(),
  code: 'EV-DEMO-1',
  mode: 'rehearsal',
  rule: 'R1',
  events: [],
})
const reviewer: Actor = { id: 'operator-a', kind: 'human' }
function step(o: Order, plan: 'expedite' | 'split' | 'original' = 'expedite') {
  const s = pending(o)!
  const c: Command = { node: s.key, operation: randomUUID() }
  if (s.kind === 'human') {
    c.decision = 'approve'
    c.reason = s.title
    if (s.key === 'commit') c.plan = plan
  }
  const a: Actor = s.kind === 'human' ? reviewer : { id: s.role, kind: 'sample_assistant' }
  expect(project(o).steps.find((x) => x.state === 'current')?.key).toBe(s.key)
  const next = advance(o, c, a, '2026-11-01')
  expect(advance(next, c, a, 'later')).toBe(next)
  return next
}
describe('motor order', () => {
  it('opens the same order in each bound role workbench and rejects unrelated Assistants', () => {
    const e = Object.assign(new MotorOrder(), {
      id: randomUUID(), coordinatorId: randomUUID(), assistants: { quality: randomUUID(), purchasing: randomUUID() },
    })
    const runtime = new MotorRuntime({} as never, {} as never)
    const expected = runtime.entry(e)
    expect(expected).toMatchObject({ xpertId: e.coordinatorId, selectionId: e.id })
    for (const host of [e.coordinatorId, ...Object.values(e.assistants)])
      expect(runtime.entry(e, host)).toEqual({ ...expected, xpertId: host })
    const target = { executorXpertId: e.assistants.purchasing }
    expect(runtime.entry(e, e.assistants.quality, target)).toEqual({ ...expected, xpertId: e.assistants.purchasing })
    expect(runtime.entry(e, e.assistants.quality, {})).toEqual(expected)
    expect(() => runtime.entry(e, e.assistants.quality, { executorXpertId: randomUUID() })).toThrow('assistant_not_in_order')
    expect(() => runtime.entry(e, randomUUID(), target)).toThrow('assistant_not_in_order')
    expect(() => runtime.entry(e, randomUUID())).toThrow('assistant_not_in_order')
  })

  it.each(['expedite', 'split', 'original'] as const)('traces the full order with %s schedule', (plan) => {
    let o = order()
    for (const task of flow) {
      expect(pending(o)?.key).toBe(task.key)
      o = step(o, plan)
    }
    expect(status(o)).toBe('complete')
    const facts = (n: string) =>
      o.events
        .find((x) => x.node === n)!
        .facts.map((f) => f.value)
        .join(' ')
    for (const s of ['EV-DEMO-1-M001', 'SEAL-L07-EV-DEMO-1', 'EM-160/B', 'TEST-EV-DEMO-1', '疑似进水'])
      expect(facts('trace')).toContain(s)
    expect(facts('ship')).toContain(plan === 'split' ? '8 台' : plan === 'original' ? '第 12 天' : '第 9 天')
    expect(facts('cause')).toContain('偏位')
    expect(facts('replay')).toContain('6 / 6')
    const next = step(successor(o, randomUUID(), 'EV-NEXT'))
    expect(next.events[0]?.facts.map((f) => f.value)).toContain('IP67')
    expect(o.rule).toBe('R1')
    expect(next.parent).toBe(o.code)
  })
  it('blocks out-of-order, impersonated, duplicate and rejected approvals', () => {
    let o = step(step(order()))
    const c: Command = {
      node: 'lock',
      operation: 'one',
      decision: 'reject',
      reason: '缺试验要求',
    }
    expect(() => advance(o, c, { id: 'agent', kind: 'sample_assistant' }, 'now')).toThrow('human')
    expect(() => successor(o, 'x', 'y')).toThrow('published')
    expect(() => advance(o, { ...c, node: 'ship' }, reviewer, 'now')).toThrow('current')
    o = advance(o, c, reviewer, 'now')
    expect(status(o)).toBe('rejected')
    expect(() => advance(o, { ...c, decision: 'approve' }, reviewer, 'now')).toThrow('conflict')
    expect(() => advance(o, { ...c, operation: 'two' }, reviewer, 'now')).toThrow('current')
  })
  it('keeps replay, experiment mode and production quality separate', () => {
    expect(score(replay(), 'before')).toBe(3)
    expect(score(replay(), 'after')).toBe(6)
    expect(extract('端子盒 IP67', 'R2')).toBeNull()
    expect(plans().map((p) => p.last)).toEqual([9, 12, 12])
    expect(() =>
      advance(
        { ...order(), mode: 'pipeline' },
        { node: 'intake', operation: 'x' },
        { id: 'demo', kind: 'sample_assistant' },
        'now',
      ),
    ).toThrow('assistant_required')
  })
  it('matches all assistant lanes and validates the native DAG with the host catalog', () => {
    expect(suiteRoles).toHaveLength(7)
    expect(templates.map((t) => parse(t.dslContent!).team.agent.key)).toHaveLength(8)
    expect(new Set(flow.filter((s) => s.kind === 'assistant').map((s) => s.role)).size).toEqual(
      Object.keys(roles).length - 1,
    )
    const config = configuration(),
      catalog = new MotorContribution()
    const check = checkProjectPipelineConfiguration(config, [
      ...catalog.descriptors,
      { kind: 'completion', ref: 'platform.output-validated@1' },
      { kind: 'schema', ref: 'platform.human-decision@1' },
    ])
    expect(check.issues).toEqual([])
  })
})

it('copies the reviewed assembly instruction to the child BOM and requires a receipt for its extra inspection', () => {
  let first = order()
  for (const node of flow) first = step(first)
  let child = successor(first, randomUUID(), 'EV-NEXT')
  while (pending(child)) child = step(child)
  const facts = (key: string) => child.events.find((e) => e.node === key)!.facts
  expect(facts('bom')).toContainEqual({
    label: '上单已批准的装配要求',
    value: child.corrective!.instruction,
  })
  expect(facts('test').find((f) => f.label === '新增样例复核回执')?.value).toContain('CHECK-EV-NEXT')
  expect(facts('publish')[0]?.value).toBe('R2')
  expect(first.events.find((e) => e.node === 'test')?.facts.some((f) => f.label === '新增样例复核回执')).toBe(
    false,
  )
})

describe('v1.1 evidence routing', () => {
  it.each(['shortage', 'indexGap'] as const)('runs only the applicable work for %s', (variant) => {
    let o: Order = { ...order(), variant }
    while (pending(o)?.key !== 'asBuilt') o = step(o)
    expect(readySteps(o).map((s) => s.key)).toEqual(['asBuilt', 'benchReport'])
    const report = { node: 'benchReport' as const, operation: randomUUID() }
    const qa = { id: 'quality', kind: 'sample_assistant' as const }
    o = advance(o, report, qa, 'now')
    expect(readySteps(o).map((s) => s.key)).toEqual(['asBuilt'])
    expect(advance(o, report, qa, 'retry')).toBe(o)
    expect(() =>
      advance(
        o,
        {
          node: 'cause',
          operation: randomUUID(),
          decision: 'approve',
          reason: 'test',
        },
        reviewer,
        'now',
      ),
    ).toThrow('node_not_current')
    o = step(o)
    while (pending(o)) o = step(o)
    const view = project(o)
    expect(status(o)).toBe('complete')
    expect(view.materialRoute).toBe(variant === 'shortage' ? 'shortage' : 'stocked')
    expect(view.traceRoute).toBe(variant === 'shortage' ? 'matched' : 'lookup')
    expect(view.steps.filter((s) => s.state === 'skipped').map((s) => s.key)).toEqual([
      variant === 'shortage' ? 'recoverReport' : 'expediteCheck',
    ])
    expect(view.steps.find((s) => s.key === 'cause')?.facts.map((f) => f.value)).toContain('TEST-' + o.code)
    if (variant === 'indexGap') expect(view.plans[0]?.label).not.toContain('采购')
    const child = successor(o, randomUUID(), 'EV-CHILD')
    expect(child.variant).toBe(variant)
    expect(child.rule).toBe('R2')
  })

  it('keeps the v1 binding and prevents decisions with missing or foreign evidence', async () => {
    expect(configuration({}, '1.0.0')).toEqual(
      JSON.parse(readFileSync(new URL('../blueprints/project-pipeline-v1.json', import.meta.url), 'utf8')),
    )
    let o: Order = { ...order(), variant: 'shortage' }
    while (pending(o)?.key !== 'expediteCheck') o = step(o)
    const runtime = Object.create(MotorRuntime.prototype) as MotorRuntime
    runtime.pinned = async () => ({ id: o.id, data: o } as Awaited<ReturnType<MotorRuntime['pinned']>>)
    const context = (inputs: unknown) => ({ inputs } as Parameters<MotorRuntime['route']>[0])
    expect((await runtime.route(context({}), 'materialRoute')).status).toBe('blocked')
    expect(
      (
        await runtime.route(
          context({
            supply: { kind: 'evidence', value: { objectKey: 'foreign' } },
          }),
          'materialRoute',
        )
      ).status,
    ).toBe('blocked')
    delete o.events.at(-1)!.routeRecord
    expect(readySteps(o)).toEqual([])
    expect(status(o)).not.toBe('complete')
  })
})
