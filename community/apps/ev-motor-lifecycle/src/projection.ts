import {
  readySteps,
  skipped,
  routeOutcome,
  orderSteps,
  orderPlans,
  status,
  evidence,
  type Order,
  type Fact,
} from './domain.js'
import { roles, reviewers, stages, type StepKey, type Role } from './process.js'
import { sample, replay } from './sample.js'
import type { Variant } from './process.js'
export function project(o: Order) {
  const now = readySteps(o)
  return {
    id: o.id,
    code: o.code,
    mode: o.mode,
    rule: o.rule,
    parent: o.parent,
    status: status(o),
    variant: o.variant,
    materialRoute: routeOutcome(o, 'materialRoute'),
    traceRoute: routeOutcome(o, 'traceRoute'),
    steps: orderSteps(o).map((s) => {
      const event = o.events.find((e) => e.node === s.key),
        current = now.some((step) => step.key === s.key)
      const state: 'rejected' | 'done' | 'current' | 'queued' | 'skipped' = event
        ? event.decision === 'reject'
          ? 'rejected'
          : 'done'
        : current
        ? 'current'
        : skipped(o, s.key)
        ? 'skipped'
        : 'queued'
      let facts: Fact[] = event?.facts ?? []
      if (current) facts = s.key === 'commit' ? evidence(o, 'schedule') : evidence(o, s.key)
      return {
        key: s.key,
        title: s.title,
        stage: stages[s.stage],
        kind: s.kind,
        role: s.kind === 'assistant' ? roles[s.role] : reviewers[s.reviewer],
        state,
        facts,
        event,
      }
    }),
    plans: orderPlans(o),
    sampleBOM: {
      standardIP: sample.standardIP,
      requestedIP: 'IP67',
      terminalIP: 'IP54',
      boltsBefore: 4,
      boltsAfter: 8,
      seal: sample.seal,
    },
    sampleEvaluation: replay(),
  }
}
export interface WorkbenchData {
  desks?: import('./node-workbench.js').NodeWorkbench
  surface: 'dashboard' | 'workspace'
  canCreate: boolean
  orders: { id: string; code: string; status: string }[]
  counts: {
    active: number
    waiting: number
    complete: number
    rejected: number
  }
  attempts?: {
    node: StepKey
    executionId: string
    conversationId: string
    assistantId: string
    submitted: boolean
  }[]
  evolution?: { changeId: string; version: string | null } | null
  selected: ReturnType<typeof project> | null
  instanceId?: string | null
  projectId?: string
  roleBindings?: Record<string, string>
  ownerId?: string
  assistantTitles?: Partial<Record<Role, string>>
}
export type ActionInput = {
  caseId?: string
  operation: string
  node?: StepKey
  decision?: 'approve' | 'reject'
  reason?: string
  plan?: 'expedite' | 'split' | 'original'
  variant?: Variant
  mode?: 'rehearsal' | 'pipeline'
}
