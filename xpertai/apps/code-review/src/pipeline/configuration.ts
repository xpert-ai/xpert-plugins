import { Injectable } from '@nestjs/common'
import { projectPipelineConfigurationSchema, projectPipelineConfigurationFormSchema, type ProjectPipelineExtensionDescriptor } from '@xpert-ai/contracts'
import { ProjectPipelineContributor } from '@xpert-ai/plugin-sdk'
import { refs } from './contract.js'

export function reviewPipelineConfiguration(assistants = { correctness: 'select-correctness', security: 'select-security', verifier: 'select-verifier' },
  parameters = { requireChecks: true, requiredChecks: [] as string[], blockingPriorities: ['P0', 'P1'] }) {
  return projectPipelineConfigurationSchema.parse({ schemaVersion: 1,
    template: { key: 'code-review.pull-request', version: '1.0.0', title: 'Code Review', executionAuthority: 'platform',
      subjectResolverRef: refs.subject, topology: { source: 'definition' },
      roles: [{ key: 'system', allowedKinds: ['service'] }, { key: 'reviewer', allowedKinds: ['assistant'] },
        { key: 'verifier', allowedKinds: ['assistant'] }, { key: 'owner', allowedKinds: ['human'] }],
      lanes: [{ key: 'system', roleKey: 'system', label: '准备与交付', order: 0 },
        { key: 'review', roleKey: 'reviewer', label: '并行审查', order: 1 },
        { key: 'verify', roleKey: 'verifier', label: '问题复核', order: 2 }, { key: 'owner', roleKey: 'owner', label: '负责人', order: 3 }],
      stages: ['输入版本', '并行检查', '复核与决策', '人工确认', '交付'].map((label, order) => ({ key: `stage${order}`, label, order })),
      nodes: [{ key: 'prepare', kind: 'work', laneKey: 'system', stageKey: 'stage0', executorSlot: 'service', operationRef: refs.prepare,
        completionRef: 'platform.output-validated@1', inputBindings: { subject: { from: 'subject' } }, outputPorts: { snapshot: refs.snapshot } },
      { key: 'fork', kind: 'fork', stageKey: 'stage1' },
      ...(['correctness', 'security'] as const).map(key => ({ key, kind: 'work', laneKey: 'review', stageKey: 'stage1', executorSlot: key,
        operationRef: refs[key], completionRef: 'platform.output-validated@1', inputBindings: { snapshot: { from: 'node_output', nodeKey: 'prepare', port: 'snapshot' } },
        outputPorts: { findings: refs.findings } })),
      { key: 'ci', kind: 'external_wait', laneKey: 'system', stageKey: 'stage1', subscriptionRef: refs.ci,
        inputBindings: { snapshot: { from: 'node_output', nodeKey: 'prepare', port: 'snapshot' } }, outputPorts: { checks: refs.checks } },
      { key: 'join', kind: 'join', stageKey: 'stage2', join: { mode: 'all_selected', accept: 'completed' } },
      { key: 'verify', kind: 'work', laneKey: 'verify', stageKey: 'stage2', executorSlot: 'verifier', operationRef: refs.verify,
        completionRef: 'platform.output-validated@1', inputBindings: {
          snapshot: { from: 'node_output', nodeKey: 'prepare', port: 'snapshot' },
          candidates: { from: 'collection', items: ['correctness', 'security'].map(nodeKey => ({ from: 'node_output', nodeKey, port: 'findings' })) },
          checks: { from: 'node_output', nodeKey: 'ci', port: 'checks' } }, outputPorts: { findings: refs.findings } },
      { key: 'route', kind: 'router', stageKey: 'stage2', policyRef: refs.readiness, outcomes: ['human', 'rework'], unmatched: 'block',
        inputBindings: { findings: { from: 'node_output', nodeKey: 'verify', port: 'findings' }, checks: { from: 'node_output', nodeKey: 'ci', port: 'checks' } } },
      { key: 'approve', kind: 'human_gate', laneKey: 'owner', stageKey: 'stage3', candidateRoleKey: 'owner', policyRef: refs.approval,
        outcomes: ['accepted', 'rework'], outcomeLabels: { accepted: '确认发布审查评论', rework: '等待新版本重新审查' },
        inputBindings: { findings: { from: 'node_output', nodeKey: 'verify', port: 'findings' } },
        outputPorts: { decision: 'platform.human-decision@1' } },
      { key: 'publish', kind: 'work', laneKey: 'system', stageKey: 'stage4', executorSlot: 'service', operationRef: refs.publish,
        completionRef: 'platform.output-validated@1', inputBindings: { approval: { from: 'node_output', nodeKey: 'approve', port: 'decision' },
          findings: { from: 'node_output', nodeKey: 'verify', port: 'findings' } }, outputPorts: { receipt: refs.delivery } },
      { key: 'confirmed', kind: 'external_wait', laneKey: 'system', stageKey: 'stage4', subscriptionRef: refs.confirmed,
        inputBindings: { receipt: { from: 'node_output', nodeKey: 'publish', port: 'receipt' } }, outputPorts: { receipt: refs.delivery } },
      { key: 'done', kind: 'terminal', stageKey: 'stage4', outcome: 'completed' },
      { key: 'rework', kind: 'terminal', stageKey: 'stage3', outcome: 'rework', disposition: 'await_new_subject' }],
      edges: [{ from: 'prepare', to: 'fork' }, ...['correctness', 'security', 'ci'].map(to => ({ from: 'fork', to })),
        ...['correctness', 'security', 'ci'].map(from => ({ from, to: 'join' })), { from: 'join', to: 'verify' }, { from: 'verify', to: 'route' },
        { from: 'route', to: 'approve', outcome: 'human' }, { from: 'route', to: 'rework', outcome: 'rework' },
        { from: 'approve', to: 'publish', outcome: 'accepted' }, { from: 'approve', to: 'rework', outcome: 'rework' },
        { from: 'publish', to: 'confirmed' }, { from: 'confirmed', to: 'done' }],
      roundPolicy: { entryNodeKey: 'prepare', maxRounds: 3, onRework: 'await_new_subject_then_next_round', onLimit: 'attention',
        newVersionWhileActive: 'supersede_round', terminalOutcomes: ['completed'] },
      failurePolicy: { requiredNodeFailure: 'block_and_attention', unknownExecution: 'inspect_without_replay' } },
    binding: { templateRef: 'code-review.pull-request@1.0.0', roleBindings: { owner: { kind: 'human', selectionKey: 'project-managers' } },
      executorBindings: { service: { kind: 'service', roleKey: 'system', selectionKey: 'code-review-services' },
        correctness: { kind: 'assistant', roleKey: 'reviewer', selectionKey: assistants.correctness },
        security: { kind: 'assistant', roleKey: 'reviewer', selectionKey: assistants.security },
        verifier: { kind: 'assistant', roleKey: 'verifier', selectionKey: assistants.verifier } }, parameters,
      limits: { maxConcurrentExecutions: 2, maxTechnicalAttemptsPerNode: 2, runTimeoutMinutes: 60 } } })
}
export function localReviewPipelineConfiguration(assistants?: Parameters<typeof reviewPipelineConfiguration>[0],
  parameters = { requireChecks: false, requiredChecks: [] as string[], blockingPriorities: ['P0', 'P1'] }) {
  const config = reviewPipelineConfiguration(assistants, parameters)
  if (config.template.executionAuthority !== 'platform') throw new Error('Managed review template required')
  config.template.key = 'code-review.local-git'
  config.template.title = 'Code Review · 本地 Git'
  config.template.subjectResolverRef = refs.localSubject
  config.binding.templateRef = 'code-review.local-git@1.0.0'
  config.template.nodes = config.template.nodes.filter(node => node.key !== 'confirmed').map(node => {
    if (node.kind === 'human_gate') return { ...node, outcomeLabels: { accepted: '确认保存审查结果', rework: '等待新版本重新审查' } }
    if (node.key === 'publish' && node.kind === 'work') return { ...node, operationRef: refs.archive, outputPorts: { receipt: refs.localDelivery } }
    return node
  })
  config.template.edges = config.template.edges.filter(edge => edge.from !== 'confirmed').map(edge =>
    edge.to === 'confirmed' ? { ...edge, to: 'done' } : edge)
  return projectPipelineConfigurationSchema.parse(config)
}
const one = (schemaRef: string) => ({ schemaRef, cardinality: 'one' as const })
export const reviewPipelineDescriptors: ProjectPipelineExtensionDescriptor[] = [
  ...[refs.snapshot, refs.findings, refs.checks, refs.delivery, refs.localDelivery].map(ref => ({ kind: 'schema' as const, ref })),
  ...[refs.subject, refs.localSubject].map(ref => ({ kind: 'subject' as const, ref, outputSchemaRef: refs.snapshot })),
  { kind: 'operation', ref: refs.archive, effects: 'isolated_write', idempotency: 'keyed_receipt', requiredCapabilities: [], inputs: {
    approval: one('platform.human-decision@1'), findings: one(refs.findings) }, outputs: { receipt: refs.localDelivery } },
  { kind: 'operation', ref: refs.prepare, effects: 'isolated_write', idempotency: 'keyed_receipt', requiredCapabilities: [], inputs: { subject: one(refs.snapshot) }, outputs: { snapshot: refs.snapshot } },
  ...[refs.correctness, refs.security].map(ref => ({ kind: 'operation' as const, ref, effects: 'isolated_write' as const,
    idempotency: 'keyed_receipt' as const, retry: 'after_confirmed_failure' as const, requiredCapabilities: [], inputs: { snapshot: one(refs.snapshot) }, outputs: { findings: refs.findings } })),
  { kind: 'operation', ref: refs.verify, effects: 'isolated_write', idempotency: 'keyed_receipt', retry: 'after_confirmed_failure', requiredCapabilities: [], inputs: {
    snapshot: one(refs.snapshot), candidates: { schemaRef: refs.findings, cardinality: 'collection' }, checks: one(refs.checks) }, outputs: { findings: refs.findings } },
  { kind: 'operation', ref: refs.publish, effects: 'external_write', idempotency: 'keyed_receipt', requiredCapabilities: [], inputs: {
    approval: one('platform.human-decision@1'), findings: one(refs.findings) }, outputs: { receipt: refs.delivery } },
  { kind: 'subscription', ref: refs.ci, outputs: { checks: refs.checks } }, { kind: 'subscription', ref: refs.confirmed, outputs: { receipt: refs.delivery } },
  { kind: 'policy', ref: refs.readiness, outcomes: ['human', 'rework'] }, { kind: 'policy', ref: refs.approval, outcomes: ['accepted', 'rework'] }
]
export const reviewPipelineConfigurationForm = projectPipelineConfigurationFormSchema.parse({
  templateRef: 'code-review.pull-request@1.0.0',
  description: { en_US: 'Parallel correctness and security review, independent verification, then human approval before posting a review comment.',
    zh_Hans: '并行完成正确性与安全审查，由独立智能体复核，再经人工确认发布审查评论。' },
  assistantSlots: [
    { slot: 'correctness', label: { en_US: 'Correctness reviewer', zh_Hans: '正确性审查' } },
    { slot: 'security', label: { en_US: 'Security reviewer', zh_Hans: '安全审查' } },
    { slot: 'verifier', label: { en_US: 'Independent verifier', zh_Hans: '独立复核' } }
  ],
  parameters: [
    { key: 'requireChecks', type: 'boolean', label: { en_US: 'Require successful checks', zh_Hans: '要求检查通过' } },
    { key: 'requiredChecks', type: 'string_list', maxItems: 100, itemMaxLength: 200,
      label: { en_US: 'Required check names', zh_Hans: '必要检查名称' },
      description: { en_US: 'An empty list uses all checks returned for the current commit.', zh_Hans: '留空时检查当前提交返回的所有检查项。' } },
    { key: 'blockingPriorities', type: 'multi_choice', minItems: 1, label: { en_US: 'Priorities requiring a new revision', zh_Hans: '需要返工的严重级别' },
      options: ['P0', 'P1', 'P2', 'P3'].map(value => ({ value, label: { en_US: value } })) }
  ]
})

@Injectable()
@ProjectPipelineContributor('code-review')
export class ReviewPipelineContribution {
  readonly key = 'code-review'
  readonly configurations = [reviewPipelineConfiguration(), localReviewPipelineConfiguration()]
  readonly descriptors = reviewPipelineDescriptors
  readonly forms = [reviewPipelineConfigurationForm, projectPipelineConfigurationFormSchema.parse({ ...reviewPipelineConfigurationForm,
    templateRef: 'code-review.local-git@1.0.0', description: { en_US: 'Review an immutable local Git snapshot and retain approved findings in this Project.',
      zh_Hans: '审查固定版本的本地 Git 快照，经人工确认后将结果保存在当前 Project。' } })]
}
