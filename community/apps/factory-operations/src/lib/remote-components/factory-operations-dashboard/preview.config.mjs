import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const componentRoot = dirname(fileURLToPath(import.meta.url))
const platformRoot = resolve(componentRoot, '../../../../../v3_16/xpert')
export { platformRoot }

const now = '2026-08-31T06:45:00.000Z'

export default {
  title: 'Factory Operations Management · Remote View Preview',
  frameTitle: 'Factory Operations Management',
  workspaceRoot: platformRoot,
  instanceId: 'factory-operations-dashboard-preview',
  component: { root: componentRoot, runtime: 'react', title: 'Factory Operations Management' },
  hostContext: {
    manifest: { key: 'factory-operations-dashboard' }, payload: {}, initialQuery: {}, locale: 'zh-Hans',
    theme: { mode: 'light', tokens: {
      colorBackground: '#f7f9f8', colorForeground: '#17201d', colorCard: '#ffffff', colorCardForeground: '#17201d',
      colorPopover: '#ffffff', colorPopoverForeground: '#17201d', colorMuted: '#f0f4f2', colorMutedForeground: '#64716c',
      colorSecondary: '#edf3f1', colorSecondaryForeground: '#24423a', colorAccent: '#e7f5f1', colorAccentForeground: '#0f766e',
      colorBorder: '#dce5e1', colorInput: '#dce5e1', colorPrimary: '#0f766e', colorPrimaryForeground: '#ffffff', colorRing: '#2a9187', radiusMd: '0.5rem'
    } },
    debug: { enabled: false, production: true }
  },
  state: { requestDataCount: 0, navigation: null },
  async handleRequest(message, { state }) {
    if (message.type === 'requestData') {
      state.requestDataCount += 1
      return { data: dashboardData() }
    }
    if (message.type === 'invokeClientCommand' && message.commandKey === 'workbench.navigation.open') {
      state.navigation = structuredClone(message.payload)
      return { result: { success: true } }
    }
    throw new Error(`Unsupported preview request '${message.type}'.`)
  },
  async handleEvent() { return {} }
}

function dashboardData() {
  const pipelineHealth = [
    ['event-intake', '事件接入', 1, 1, 0, 16], ['equipment-engineering', '设备工程', 2, 1, 1, 14],
    ['quality-management', '质量管理', 1, 0, 0, 16], ['production-planning', '生产计划', 1, 1, 0, 15],
    ['maintenance-and-logistics', '维修与物流', 0, 1, 0, 16], ['recovery-planning', '恢复规划', 1, 0, 0, 15],
    ['operations-approval', '运营审批', 3, 0, 0, 12], ['recovery-validation', '恢复验证', 1, 1, 0, 12]
  ].map(([laneKey, laneTitle, ready, active, blocked, completed]) => ({ laneKey, laneTitle, ready, active, blocked, completed }))
  return {
    generatedAt: now,
    revision: now,
    kpis: [
      ['active-cases', '活动事件', 6, null, 'info', '授权范围内未结束的 Factory Case。'],
      ['critical-cases', '严重活动事件', 2, null, 'critical', '严重且未结束的 Factory Case。'],
      ['awaiting-approval', '等待审批', 3, null, 'warning', '等待具名用户审批的 Case。'],
      ['average-recovery', '平均恢复', 47.2, 'min', 'info', '具有持久化恢复时长的平均值。'],
      ['avoided-loss', '避免损失', 386000, 'CNY', 'success', '授权投影中的持久化避免损失估算。']
    ].map(([key, label, value, unit, status, definition]) => ({ key, label, value, unit, status, definition })),
    series: [
      {
        key: 'recovery-throughput-trend', chartIntent: 'trend', dimensions: ['date', 'opened', 'recovered', 'failedExecutions'],
        rows: [
          ['2026-08-25', 2, 1, 0], ['2026-08-26', 3, 2, 0], ['2026-08-27', 1, 2, 1],
          ['2026-08-28', 4, 3, 0], ['2026-08-29', 2, 1, 0], ['2026-08-30', 3, 2, 0], ['2026-08-31', 3, 1, 0]
        ].map(([date, opened, recovered, failedExecutions]) => ({ date, opened, recovered, failedExecutions }))
      },
      { key: 'lane-bottlenecks', chartIntent: 'bottleneck', dimensions: ['lane', 'ready', 'active', 'blocked', 'completed'], rows: pipelineHealth.map((lane) => ({ lane: lane.laneTitle, ready: lane.ready, active: lane.active, blocked: lane.blocked, completed: lane.completed })) },
      { key: 'case-status-composition', chartIntent: 'composition', dimensions: ['status', 'count'], rows: [{ status: 'awaiting_approval', count: 3 }, { status: 'recovered', count: 12 }] }
    ],
    summary: { totalCases: 18, activeCases: 6, criticalCases: 2, awaitingApproval: 3, recoveredCases: 12, failedExecutions: 1, averageResponseSeconds: 8.4, averageRecoveryMinutes: 47.2, avoidedDowntimeMinutes: 420, avoidedLossCny: 386000 },
    pipelineHealth,
    cases: [factoryCase('FAC-260831-M07', 'critical', 'awaiting_approval', 70, null), factoryCase('FAC-260831-P12', 'major', 'verifying', 90, null), factoryCase('FAC-260830-L03', 'major', 'recovered', 100, 51)],
    recentExecutions: [
      execution('record-1', 'diagnose-equipment', '设备诊断', 'failed', '第一次诊断调用超时，已保留失败记录。', 1),
      execution('record-2', 'diagnose-equipment', '设备诊断', 'succeeded', '重试成功，诊断工件已持久化。', 2),
      execution('record-3', 'assess-quality-impact', '质量影响', 'succeeded', '质量隔离范围已持久化。', 1)
    ],
    simulation: true, truncated: false, refreshedAt: now
  }
}

function factoryCase(caseKey, severity, status, percent, recoveryMinutes) {
  return { id: `id-${caseKey}`, caseKey, revision: 7, status, currentStage: status === 'awaiting_approval' ? 'approve-recovery-plan' : status === 'verifying' ? 'verify-recovery' : 'production-recovered', event: { title: '主轴振动趋势异常', deviceName: caseKey.endsWith('M07') ? '磨削中心 M-07' : '生产设备', lineId: 'A', severity }, metrics: { responseSeconds: 8, recoveryMinutes, avoidedDowntimeMinutes: 120, avoidedLossCny: 86000 }, progress: { completedSteps: percent / 10, totalSteps: 10, percent }, findings: {}, timeline: [], allowedActions: [] }
}

function execution(recordId, nodeKey, roleLabel, status, safeSummary, attemptNumber) {
  return { recordId, caseId: 'id-FAC-260831-M07', sequence: attemptNumber, attemptNumber, nodeKey, roleKey: roleLabel, roleLabel, agentKey: `Agent_${nodeKey}`, status, startedAt: now, finishedAt: now, inputRevision: 2, outputRevision: status === 'succeeded' ? 3 : null, safeSummary, conversationId: `conversation-${recordId}`, threadId: `thread-${recordId}`, executionId: `execution-${recordId}`, supersededByRecordId: status === 'failed' ? 'record-2' : null }
}
