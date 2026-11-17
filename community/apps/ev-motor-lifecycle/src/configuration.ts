import { Injectable } from '@nestjs/common'
import { ProjectPipelineContributor } from '@xpert-ai/plugin-sdk'
import {
  projectPipelineConfigurationSchema,
  type ProjectPipelineExtensionDescriptor,
} from '@xpert-ai/contracts'
import {
  flow,
  legacyFlow,
  legacyVersion,
  routers,
  roles,
  reviewers,
  stages,
  processVersion,
  projectType,
  type StepKey,
} from './process.js'
export const ref = (id: string) => 'ev_motor.' + id + '@1'
export const subject = ref('order'),
  schema = ref('receipt'),
  resolver = ref('evidence'),
  humanSchema = 'platform.human-decision@1'
export const outcomes = (key: StepKey) =>
  key === 'commit' ? ['expedite', 'split', 'original', 'reject'] : ['approve', 'reject']
const business = flow.filter((s) => s.kind === 'assistant')
const gates = flow.filter((s) => s.kind === 'human')
const source = { from: 'subject' as const }
export function configuration(assigned: Record<string, string> = {}, version = processVersion) {
  const routed = version === processVersion
  const steps = routed ? flow : legacyFlow
  const lanes = [
    ...Object.entries(roles)
      .filter(([key]) => key !== 'coordinator')
      .map(([key, label]) => ({ key, label, kind: 'assistant' })),
    ...Object.entries(reviewers).map(([k, label]) => ({
      key: 'review-' + k,
      label,
      kind: 'human',
    })),
    { key: 'receipt', label: '审批回执', kind: 'service' },
  ]
  const nodes = steps.flatMap((s): object[] => {
    const common = { key: s.key, label: s.title, stageKey: 's' + s.stage }
    if (s.kind === 'assistant')
      return [
        {
          ...common,
          kind: 'work',
          laneKey: s.role,
          executorSlot: s.role,
          operationRef: ref(s.key),
          completionRef: 'platform.output-validated@1',
          inputBindings: { subject: source },
          outputPorts: { result: schema },
        },
      ]
    const gate = {
      ...common,
      kind: 'human_gate',
      laneKey: 'review-' + s.reviewer,
      candidateRoleKey: 'review-' + s.reviewer,
      policyRef: ref(s.key),
      outcomes: outcomes(s.key),
      outcomeLabels: {
        ...(s.key === 'commit'
          ? {
              expedite: '加急并换序',
              split: '分批交付',
              original: '维持原计划',
            }
          : { approve: '批准' }),
        reject: '退回',
      },
      outputPorts: { decision: humanSchema },
    }
    return [
      gate,
      ...['accepted', 'returned'].map((branch) => ({
        ...common,
        key: s.key + '-' + branch,
        label: branch === 'accepted' ? '记录批准结果' : '记录退回原因',
        kind: 'work',
        laneKey: 'receipt',
        executorSlot: 'receipt',
        operationRef: ref('record-' + s.key),
        completionRef: 'platform.output-validated@1',
        inputBindings: {
          decision: { from: 'node_output', nodeKey: s.key, port: 'decision' },
        },
        outputPorts: { result: schema },
      })),
    ]
  })
  const edges = steps.flatMap((s, i): { from: string; to: string; outcome?: string }[] => {
    const next = steps[i + 1]?.key ?? 'complete'
    if (routed) {
      if (s.key === 'supply')
        return [
          { from: 'supply', to: 'materialRoute' },
          { from: 'materialRoute', outcome: 'shortage', to: 'expediteCheck' },
          { from: 'materialRoute', outcome: 'stocked', to: 'schedule' },
        ]
      if (s.key === 'trace')
        return [
          { from: 'trace', to: 'traceFork' },
          { from: 'traceFork', to: 'asBuilt' },
          { from: 'traceFork', to: 'benchReport' },
        ]
      if (s.key === 'asBuilt') return [{ from: 'asBuilt', to: 'traceJoin' }]
      if (s.key === 'benchReport')
        return [
          { from: 'benchReport', to: 'traceJoin' },
          { from: 'traceJoin', to: 'traceRoute' },
          { from: 'traceRoute', outcome: 'matched', to: 'cause' },
          { from: 'traceRoute', outcome: 'lookup', to: 'recoverReport' },
        ]
    }
    if (s.kind === 'assistant') return [{ from: s.key, to: next }]
    return [
      ...outcomes(s.key).map((outcome) => ({
        from: s.key,
        to: s.key + '-' + (outcome === 'reject' ? 'returned' : 'accepted'),
        outcome,
      })),
      { from: s.key + '-accepted', to: next },
      { from: s.key + '-returned', to: 'returned' },
    ]
  })
  const definition = {
    key: 'ev_motor.order',
    version,
    title: '电动车驱动电机全流程',
    executionAuthority: 'platform',
    projectTypes: [projectType],
    subjectResolverRef: subject,
    topology: { source: 'definition' },
    roles: lanes.map((l) => ({ key: l.key, allowedKinds: [l.kind] })),
    lanes: lanes.map((l, order) => ({
      key: l.key,
      roleKey: l.key,
      label: l.label,
      order,
    })),
    stages: stages.map((label, i) => ({ key: 's' + i, label, order: i })),
    nodes: [
      ...nodes,
      ...(routed
        ? [
            ...Object.entries(routers).map(([key, r]) => ({
              key,
              kind: 'router',
              label: r.title,
              stageKey: 's' + r.stage,
              policyRef: ref(key),
              outcomes: r.outcomes,
              unmatched: 'block',
              inputBindings: Object.fromEntries(
                r.sources.map((nodeKey) => [nodeKey, { from: 'node_output', nodeKey, port: 'result' }]),
              ),
            })),
            {
              key: 'traceFork',
              label: '并行调取实装与试验记录',
              kind: 'fork',
              stageKey: 's4',
            },
            {
              key: 'traceJoin',
              label: '等待两份取证回执',
              kind: 'join',
              stageKey: 's4',
              join: { mode: 'all_selected', accept: 'completed' },
            },
          ]
        : []),
      ...['complete', 'returned'].map((key) => ({
        key,
        kind: 'terminal',
        stageKey: 's4',
        outcome: key,
      })),
    ],
    edges,
    roundPolicy: {
      entryNodeKey: 'intake',
      maxRounds: 1,
      onRework: 'await_new_subject_then_next_round',
      onLimit: 'attention',
      newVersionWhileActive: 'supersede_round',
      terminalOutcomes: ['complete', 'returned'],
    },
    failurePolicy: {
      requiredNodeFailure: 'block_and_attention',
      unknownExecution: 'inspect_without_replay',
    },
  }
  return projectPipelineConfigurationSchema.parse({
    schemaVersion: 1,
    template: definition,
    binding: {
      templateRef: 'ev_motor.order@' + version,
      roleBindings: Object.fromEntries(
        lanes.filter((l) => l.kind === 'human').map((l) => [l.key, { kind: 'human', selectionKey: l.key }]),
      ),
      executorBindings: Object.fromEntries(
        lanes
          .filter((l) => l.kind !== 'human')
          .map((l) => [
            l.key,
            {
              kind: l.kind,
              roleKey: l.key,
              selectionKey: assigned[l.key] ?? l.key,
            },
          ]),
      ),
      parameters: {},
      limits: {
        maxConcurrentExecutions: routed ? 2 : 1,
        maxTechnicalAttemptsPerNode: 2,
        runTimeoutMinutes: 1440,
      },
    },
  })
}
const op = (key: string, port: string, inputSchema: string): ProjectPipelineExtensionDescriptor => ({
  kind: 'operation',
  ref: ref(key),
  effects: 'isolated_write',
  idempotency: 'keyed_receipt',
  retry: 'after_confirmed_failure',
  requiredCapabilities: [],
  inputs: { [port]: { schemaRef: inputSchema, cardinality: 'one' } },
  outputs: { result: schema },
})
@Injectable()
@ProjectPipelineContributor('ev_motor')
export class MotorContribution {
  readonly key = 'ev_motor'
  readonly configurations = [configuration({}, legacyVersion), configuration()]
  readonly descriptors: ProjectPipelineExtensionDescriptor[] = [
    { kind: 'schema', ref: schema },
    { kind: 'subject', ref: subject, outputSchemaRef: schema },
    ...Object.entries(routers).map(([key, r]) => ({
      kind: 'policy' as const,
      ref: ref(key),
      outcomes: [...r.outcomes],
    })),
    ...business.map((s) => op(s.key, 'subject', schema)),
    ...gates.flatMap((s): ProjectPipelineExtensionDescriptor[] => [
      { kind: 'policy', ref: ref(s.key), outcomes: outcomes(s.key) },
      op('record-' + s.key, 'decision', humanSchema),
    ]),
  ]
}
