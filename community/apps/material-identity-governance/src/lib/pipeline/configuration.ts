import { Injectable } from '@nestjs/common'
import { ProjectPipelineContributor } from '@xpert-ai/plugin-sdk'
import { projectPipelineConfigurationSchema, type ProjectPipelineExtensionDescriptor } from '@xpert-ai/contracts'
import { FLOW_DEFINITION } from '../flow-definition.js'
import { MATERIAL_PROJECT_TYPE } from '../server/project-type.js'

export const refs = { subject: 'material_identity.case@1', evidence: 'material_identity.evidence@1',
  result: 'material_identity.result@1', approval: 'material_identity.approval@1',
  decision: 'material_identity.record-decision@1', route: 'material_identity.conflict@1', containment: 'material_identity.containment@1' } as const
export const steps = [
  ['collect-evidence', 'intake'], ['extract-drawing', 'engineering'], ['normalize-material', 'standardization'],
  ['match-identity', 'standardization'], ['audit-conflicts', 'quality'], ['assess-impact', 'impact'],
  ['propose-governance', 'governance'], ['publish-records', 'publisher']
] as const
export type MaterialStep = typeof steps[number][0]
export const operationRef = (node: MaterialStep) => `material_identity.${node}@1`
export function materialConfiguration(assistants: Record<string, string> = {}) {
  const roles = [...new Set(steps.map(([, role]) => role))]
  const work = (key: string, stageKey: string, operationRef: string, inputBindings = {}) => ({ key, kind: 'work',
    laneKey: 'system', stageKey, executorSlot: 'service', operationRef, completionRef: 'platform.output-validated@1',
    inputBindings: { subject: { from: 'subject' }, ...inputBindings }, outputPorts: { result: refs.result } })
  const decisionInputs = { approval: { from: 'node_output', nodeKey: 'approve-governance', port: 'decision' },
    proposal: { from: 'node_output', nodeKey: 'propose-governance', port: 'result' } }
  return projectPipelineConfigurationSchema.parse({ schemaVersion: 1, template: {
    key: 'material_identity.governance', version: '1.0.0', title: '物料主数据智能治理', executionAuthority: 'platform',
    projectTypes: [MATERIAL_PROJECT_TYPE], subjectResolverRef: refs.subject, topology: { source: 'definition' },
    roles: [...roles.map(key => ({ key, allowedKinds: ['assistant'] })), { key: 'system', allowedKinds: ['service'] }, { key: 'approver', allowedKinds: ['human'] }],
    lanes: [...FLOW_DEFINITION.lanes.map(l => ({ key: l.key, roleKey: l.accountableRoleKey, label: l.title, order: l.order })),
      { key: 'system', roleKey: 'system', label: '业务规则', order: 80 }, { key: 'approver', roleKey: 'approver', label: '人工审批', order: 65 }],
    stages: FLOW_DEFINITION.stages.map(s => ({ key: s.key, label: s.title, order: s.order })),
    nodes: [...steps.map(([key, role]) => {
      const node = FLOW_DEFINITION.nodes.find(n => n.key === key)!
      return { key, label: node.title, kind: 'work', laneKey: role, stageKey: node.stageKey, executorSlot: role,
        operationRef: operationRef(key), completionRef: 'platform.output-validated@1', inputBindings: { subject: { from: 'subject' } }, outputPorts: { result: refs.result } }
    }),
      { key: 'route-conflict', kind: 'router', stageKey: 'assess', policyRef: refs.route, outcomes: ['clear', 'conflict'], unmatched: 'block',
        inputBindings: { audit: { from: 'node_output', nodeKey: 'audit-conflicts', port: 'result' } } },
      work('contain-conflict', 'assess', refs.containment),
      { key: 'merge-conflict', kind: 'join', stageKey: 'assess', join: { mode: 'all_selected', accept: 'completed' } },
      { key: 'approve-governance', label: '人工批准治理方案', kind: 'human_gate', laneKey: 'approver', stageKey: 'decide', candidateRoleKey: 'approver',
        policyRef: refs.approval, outcomes: ['approved', 'rejected'], outcomeLabels: { approved: '批准当前方案', rejected: '拒绝当前方案' },
        inputBindings: { proposal: { from: 'node_output', nodeKey: 'propose-governance', port: 'result' } }, outputPorts: { decision: 'platform.human-decision@1' } },
      work('record-approval', 'decide', refs.decision, decisionInputs), work('record-rejection', 'decide', refs.decision, decisionInputs),
      { key: 'governed', kind: 'terminal', stageKey: 'publish', outcome: 'completed' },
      { key: 'rejected', kind: 'terminal', stageKey: 'decide', outcome: 'rejected', disposition: 'await_new_subject' }],
    edges: [
      ...['collect-evidence', 'extract-drawing', 'normalize-material', 'match-identity'].map((from, i) => ({ from, to: steps[i+1]![0] })),
      { from: 'audit-conflicts', to: 'route-conflict' }, { from: 'route-conflict', to: 'merge-conflict', outcome: 'clear' },
      { from: 'route-conflict', to: 'contain-conflict', outcome: 'conflict' }, { from: 'contain-conflict', to: 'merge-conflict' },
      { from: 'merge-conflict', to: 'assess-impact' }, { from: 'assess-impact', to: 'propose-governance' },
      { from: 'propose-governance', to: 'approve-governance' },
      { from: 'approve-governance', to: 'record-approval', outcome: 'approved' }, { from: 'approve-governance', to: 'record-rejection', outcome: 'rejected' },
      { from: 'record-approval', to: 'publish-records' }, { from: 'record-rejection', to: 'rejected' }, { from: 'publish-records', to: 'governed' }],
    roundPolicy: { entryNodeKey: 'collect-evidence', maxRounds: 20, onRework: 'await_new_subject_then_next_round', onLimit: 'attention',
      newVersionWhileActive: 'supersede_round', terminalOutcomes: ['completed'] },
    failurePolicy: { requiredNodeFailure: 'block_and_attention', unknownExecution: 'inspect_without_replay' }
  }, binding: { templateRef: 'material_identity.governance@1.0.0', roleBindings: { approver: { kind: 'human', selectionKey: 'project-managers' } },
    executorBindings: Object.fromEntries([...roles.map(role => [role, { kind: 'assistant', roleKey: role, selectionKey: assistants[role] ?? `select-${role}` }]),
      ['service', { kind: 'service', roleKey: 'system', selectionKey: 'material-identity-services' }]]), parameters: {},
    limits: { maxConcurrentExecutions: 1, maxTechnicalAttemptsPerNode: 2, runTimeoutMinutes: 180 } } })
}
const one = (schemaRef: string) => ({ schemaRef, cardinality: 'one' as const })
export const materialDescriptors: ProjectPipelineExtensionDescriptor[] = [
  { kind: 'schema', ref: refs.result }, { kind: 'subject', ref: refs.subject, outputSchemaRef: refs.result },
  ...[...steps.map(([key]) => operationRef(key)), refs.containment].map(ref => ({ kind: 'operation' as const, ref, effects: 'isolated_write' as const,
    idempotency: 'keyed_receipt' as const, retry: 'after_confirmed_failure' as const, requiredCapabilities: [], inputs: { subject: one(refs.result) }, outputs: { result: refs.result } })),
  { kind: 'operation', ref: refs.decision, effects: 'isolated_write', idempotency: 'keyed_receipt', requiredCapabilities: [],
    inputs: { subject: one(refs.result), approval: one('platform.human-decision@1'), proposal: one(refs.result) }, outputs: { result: refs.result } },
  { kind: 'policy', ref: refs.approval, outcomes: ['approved', 'rejected'] }, { kind: 'policy', ref: refs.route, outcomes: ['clear', 'conflict'] }
]
@Injectable() @ProjectPipelineContributor('material_identity')
export class MaterialPipelineContribution {
  readonly key = 'material_identity'
  readonly configurations = [materialConfiguration()]
  readonly descriptors = materialDescriptors
}
