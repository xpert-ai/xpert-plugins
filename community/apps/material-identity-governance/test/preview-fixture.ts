import { createDemoCase } from '../src/lib/demo-scenarios'
import { projectDashboard, projectFlow } from '../src/lib/flow-projector'
import { applyDomainStep } from '../src/lib/governance-domain'
import type {
  ActionInput,
  ExecutionRecord,
  GovernanceCase,
  Surface,
  ViewQuery,
} from '../src/lib/contracts'
const time = '2026-09-05T02:00:00.000Z'
function advance(c: GovernanceCase, count: number) {
  let current = c
  for (let i = 0; i < count; i++) {
    const node = projectFlow(current).nodes.find(
      (n) => n.executable && n.executionMode === 'assistant_task',
    )
    if (!node) break
    current = applyDomainStep(current, node.key, node.laneKey, time)
  }
  return current
}
export function initialState() {
  return {
    cases: [
      advance(
        createDemoCase(
          'duplicate_codes',
          '00000000-0000-4000-8000-000000000101',
        ),
        7,
      ),
      advance(
        createDemoCase(
          'code_collision',
          '00000000-0000-4000-8000-000000000102',
        ),
        7,
      ),
      createDemoCase('drawing_request', '00000000-0000-4000-8000-000000000103'),
    ],
    records: [] as ExecutionRecord[],
    selectionId: '00000000-0000-4000-8000-000000000102',
    surface: 'dashboard' as Surface,
    requests: 0,
    actions: [] as string[],
    navigation: [] as object[],
  }
}
type State = ReturnType<typeof initialState>
interface Message {
  type: string
  query?: ViewQuery
  actionKey?: string
  input?: ActionInput
  payload?: {
    target: string
    viewKey?: string
    selectionId?: string
    parameters?: { surface?: Surface }
    conversationId?: string
    executionId?: string
  }
}
export async function handleRequest(
  message: Message,
  { state }: { state: State },
) {
  if (message.type === 'requestData') {
    state.requests++
    if (message.query?.selectionId)
      state.selectionId = message.query.selectionId
    const current = state.cases.find((c) => c.id === state.selectionId) ?? null
    return {
      data: {
        surface: state.surface,
        table: {
          items: state.cases.map(
            ({ id, caseKey, title, kind, status, revision, updatedAt }) => ({
              id,
              caseKey,
              title,
              kind,
              status,
              revision,
              updatedAt,
            }),
          ),
          total: state.cases.length,
          page: 1,
          pageSize: 20,
        },
        selectedCase: current,
        flow: current ? projectFlow(current, state.records) : null,
        dashboard: projectDashboard(state.cases, state.records),
        canManage: true,
        canApprove: true,
        simulation: true,
      },
    }
  }
  if (message.type === 'invokeClientCommand') {
    state.navigation.push(message.payload ?? {})
    if (message.payload?.target === 'workbench.view') {
      state.surface = message.payload.parameters?.surface ?? 'pipeline'
      if (message.payload.selectionId)
        state.selectionId = message.payload.selectionId
    }
    return { result: { success: true, code: 'opened' } }
  }
  if (message.type === 'executeAction') {
    const input = message.input!
    state.actions.push(message.actionKey!)
    if (message.actionKey === 'create_case') {
      const c = createDemoCase(
        input.kind ?? 'duplicate_codes',
        `00000000-0000-4000-8000-${String(state.cases.length + 101).padStart(12, '0')}`,
        input.title,
      )
      state.cases.push(c)
      state.selectionId = c.id
      return { result: { success: true, code: 'created', caseId: c.id } }
    }
    const index = state.cases.findIndex((c) => c.id === input.caseId)
    const c = state.cases[index]
    if (!c) return { result: { success: false, code: 'case_not_found' } }
    if (c.revision !== input.expectedRevision)
      return { result: { success: false, code: 'stale_revision' } }
    if (message.actionKey === 'decide_proposal') {
      if (!c.proposal || !input.reason?.trim())
        return { result: { success: false, code: 'reason_required' } }
      c.approval = {
        proposalRevision: c.proposal.revision,
        decision: input.decision!,
        actor: 'Preview reviewer',
        reason: input.reason,
        at: time,
      }
      c.status = input.decision === 'approved' ? 'approved' : 'rejected'
      c.revision++
    } else {
      const node = projectFlow(c).nodes.find((n) =>
        input.nodeKey
          ? n.key === input.nodeKey
          : n.executable && n.executionMode === 'assistant_task',
      )
      if (!node)
        return { result: { success: false, code: 'no_executable_node' } }
      if (node.key === 'publish-records')
        c.publications = ['MDM', 'ERP'].map((system) => ({
          system,
          operationId: `preview-${system}`,
          status: 'confirmed',
          externalReference: `PREVIEW-${system}`,
          errorCode: null,
          at: time,
        }))
      state.cases[index] = applyDomainStep(c, node.key, node.laneKey, time)
      state.records.push({
        id: `preview-record-${state.records.length + 1}`,
        caseId: c.id,
        nodeKey: node.key,
        roleKey: node.laneKey,
        attempt: 1,
        sequence: state.records.length + 1,
        status: 'succeeded',
        taskId: 'preview-task',
        conversationId: 'preview-conversation',
        threadId: 'preview-thread',
        executionId: 'preview-execution',
        inputRevision: c.revision,
        outputRevision: state.cases[index]!.revision,
        startedAt: time,
        finishedAt: time,
        safeSummary: '交互原型执行样例，仅用于检验布局与导航协议。',
        supersededById: null,
      })
    }
    return {
      result: {
        success: true,
        code: 'accepted',
        caseId: c.id,
        revision: state.cases[index]!.revision,
      },
    }
  }
  throw new Error('Unsupported preview operation')
}
