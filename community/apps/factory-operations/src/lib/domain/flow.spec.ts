import { describe, expect, it } from 'vitest'
import {
  applyFactoryCommand,
  createDemoFactoryCase,
  projectFactoryCase
} from './flow.js'

const baseTime = '2026-08-31T06:02:00.000Z'
const workspace = {
  projectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  status: 'ready' as const,
  canLaunchTasks: true,
  errorCode: null
}
const evidence = (source: 'iot' | 'mes' | 'qms' | 'cmms' | 'wms' | 'aps' | 'erp' | 'rule', reference: string) => ({
  source,
  reference,
  observedAt: baseTime,
  summary: reference
})

describe('factory anomaly recovery flow', () => {
  it('completes the governed M-07 recovery path', () => {
    let state = createDemoFactoryCase(
      '11111111-1111-4111-8111-111111111111',
      'FAC-260831-M07',
      baseTime
    )
    state = applyFactoryCommand(state, {
      type: 'triage',
      agentKey: 'Agent_AnomalyTriage',
      at: '2026-08-31T06:03:00.000Z',
      severity: 'critical',
      summary: '异常有效，需要并行研判。',
      confidence: 0.99,
      evidence: [evidence('iot', 'vibration'), evidence('rule', 'critical-threshold')]
    })
    state = applyFactoryCommand(state, {
      type: 'finding', kind: 'equipment', agentKey: 'Agent_EquipmentDiagnostics', at: baseTime,
      failureMode: '主轴轴承早期失效', remainingSafeMinutes: 0,
      recommendation: 'stop_immediately', summary: '立即停机。', confidence: 0.96,
      evidence: [evidence('cmms', 'bearing-history')]
    })
    state = applyFactoryCommand(state, {
      type: 'finding', kind: 'quality', agentKey: 'Agent_QualityImpact', at: baseTime,
      affectedQuantity: 126, isolationWindowMinutes: 90,
      recommendation: 'isolate_and_reinspect', summary: '隔离并复检。', confidence: 0.95,
      evidence: [evidence('qms', 'spc-trend')]
    })
    state = applyFactoryCommand(state, {
      type: 'finding', kind: 'production', agentKey: 'Agent_ProductionImpact', at: baseTime,
      impactedWorkOrderCount: 3, riskOrderCount: 2, estimatedDelayMinutes: 210,
      alternateLineId: 'B', changeoverMinutes: 45, incrementalCostCny: 1800,
      summary: 'B 线可承接两张急单。', confidence: 0.94,
      evidence: [evidence('aps', 'capacity-snapshot')]
    })
    state = applyFactoryCommand(state, {
      type: 'finding', kind: 'resources', agentKey: 'Agent_ResourceReadiness', at: baseTime,
      spareSku: 'BRG-M07-01', spareAvailability: 'available', spareQuantity: 1,
      deliveryMinutes: 18, qualifiedEngineerAvailable: true,
      summary: '备件和工程师均可用。', confidence: 0.98,
      evidence: [evidence('wms', 'stock-BRG-M07-01')]
    })
    state = applyFactoryCommand(state, {
      type: 'generate_plan', agentKey: 'Agent_RecoveryPlanning', at: baseTime
    })
    expect(state.plan?.recommendedOptionId).toBe('B')
    expect(state.plan?.executionAuthority).toBe('approval-required')

    state = applyFactoryCommand(state, {
      type: 'approve_plan', actorId: 'operations-owner', at: baseTime,
      reason: '在安全与质量约束下保证当天交付。'
    })
    state = applyFactoryCommand(state, {
      type: 'execute_plan', at: baseTime, mode: 'simulation'
    })
    state = applyFactoryCommand(state, {
      type: 'verify_recovery', agentKey: 'Agent_RecoveryVerification',
      at: '2026-08-31T08:08:00.000Z'
    })

    const summary = projectFactoryCase(state, workspace)
    expect(summary.status).toBe('recovered')
    expect(summary.progress.percent).toBe(100)
    expect(summary.execution?.actions).toHaveLength(12)
    expect(summary.metrics.avoidedLossCny).toBe(186000)
    expect(summary.allowedActions).toEqual([])
  })

  it('blocks execution before exact plan approval', () => {
    const state = createDemoFactoryCase(
      '22222222-2222-4222-8222-222222222222',
      'FAC-260831-M08',
      baseTime
    )
    expect(() =>
      applyFactoryCommand(state, {
        type: 'execute_plan', at: baseTime, mode: 'simulation'
      })
    ).toThrow()
  })

  it('never turns external mode into simulated success', () => {
    const state = createDemoFactoryCase(
      '33333333-3333-4333-8333-333333333333',
      'FAC-260831-M09',
      baseTime
    )
    expect(state.execution).toBeNull()
    expect(projectFactoryCase(state, workspace).nextAction).toContain('triage')
  })

  it('persists bounded cross-system facts for Agent handoffs', () => {
    const state = createDemoFactoryCase(
      '44444444-4444-4444-8444-444444444444',
      'FAC-260831-M10',
      baseTime
    )
    const facts = projectFactoryCase(state, workspace).analysisFacts
    expect(facts.triage.evidence).toHaveLength(2)
    expect(facts.equipment.failureMode).toBe('主轴轴承早期失效')
    expect(facts.quality.affectedQuantity).toBe(126)
    expect(facts.production.incrementalCostCny).toBe(1800)
    expect(facts.resources.deliveryMinutes).toBe(18)
    expect(facts.resources.evidence[0].observedAt).toBe(baseTime)
  })
})
