import {
  applyAction,
  createScenario,
  getViewData,
  makeAssistantPrompt
} from '/preview-fixture.mjs'

const params = new URLSearchParams(location.search)
const scenario = params.get('scenario') || 'review'
const clean = params.get('clean') === '1'
if (clean) {
  document.querySelector('.preview-bar').style.display = 'none'
}
const iframe = document.getElementById('preview')
const instanceId = 'preview-instance-1'
const storeKey = 'resume-match-preview-v1'
let state = createScenario(scenario)

function persist() {
  try {
    localStorage.setItem(storeKey, JSON.stringify({ scenario, state }))
  } catch {
    /* 预览环境可能禁用本地存储，此时只保留内存状态。 */
  }
}
function restore() {
  if (params.has('fresh')) return false
  try {
    const raw = localStorage.getItem(storeKey)
    if (!raw) return false
    const saved = JSON.parse(raw)
    if (saved?.scenario !== scenario || !saved.state) return false
    state = saved.state
    return true
  } catch {
    return false
  }
}
const restored = restore()
if (!restored) persist()

function send(message) {
  iframe.contentWindow?.postMessage(message, '*')
}
function sendInit() {
  send({
    channel: 'xpertai.remote_component',
    protocolVersion: 1,
    type: 'init',
    instanceId,
    locale: 'zh-CN',
    manifest: { key: 'resume_match_workbench' },
    initialQuery: { page: 1, pageSize: 20 },
    theme: { mode: 'light', density: 'default', tokens: { colorPrimary: '#5b5bd6' } },
    debug: { enabled: true }
  })
}
function respond(requestId, payload) {
  send({
    channel: 'xpertai.remote_component',
    protocolVersion: 1,
    instanceId,
    type: 'response',
    requestId,
    ...payload
  })
}
function fail(requestId, message) {
  send({
    channel: 'xpertai.remote_component',
    protocolVersion: 1,
    instanceId,
    type: 'error',
    requestId,
    message
  })
}
function hostEvent(toolName) {
  send({
    channel: 'xpertai.remote_component',
    protocolVersion: 1,
    instanceId,
    type: 'hostEvent',
    event: {
      type: 'tool.completed',
      toolName,
      data: { output: { analysisId: state.selectedId, status: state.analyses[0]?.status } }
    }
  })
}

window.addEventListener('message', (event) => {
  if (event.source !== iframe.contentWindow) return
  const message = event.data
  if (!message || message.channel !== 'xpertai.remote_component') return
  if (message.type === 'ready') {
    sendInit()
    return
  }
  if (message.instanceId !== instanceId) return
  if (message.type === 'requestData') {
    respond(message.requestId, { data: getViewData(state, message.query || {}) })
    return
  }
  if (message.type === 'executeAction') {
    handleAction(message)
    return
  }
  if (message.type === 'invokeClientCommand') {
    setTimeout(() => respond(message.requestId, { result: { success: true } }), 180)
    return
  }
})

function handleAction(message) {
  const actionKey = message.actionKey
  if (actionKey === 'refresh') {
    respond(message.requestId, { result: { success: true, data: {} } })
    return
  }
  const outcome = applyAction(state, actionKey, message.input || {})
  if (!outcome.ok) {
    fail(message.requestId, outcome.message)
    return
  }
  state = outcome.state
  persist()
  respond(message.requestId, {
    result: {
      success: true,
      message: outcome.message,
      data: outcome.data
    }
  })
  if (outcome.analysisId) {
    const delay = scenario === 'failure' && actionKey === 'prepare_analysis' ? 2800 : 1800
    setTimeout(() => {
      const current = state.analyses.find((item) => item.id === outcome.analysisId)
      if (!current || current.status !== 'waiting_ai') return
      if (scenario === 'failure' && actionKey === 'prepare_analysis') {
        state = {
          ...state,
          analyses: state.analyses.map((item) =>
            item.id === outcome.analysisId
              ? {
                  ...item,
                  status: 'failed',
                  errorMessage: '分析模型在生成结构化结果时超时，已保留本轮材料。',
                  attempt: item.attempt,
                  revision: item.revision + 1,
                  updatedAt: new Date().toISOString()
                }
              : item
          )
        }
        persist()
        hostEvent('resume_match_mark_failed')
        return
      }
      state = {
        ...state,
        analyses: state.analyses.map((item) =>
          item.id === outcome.analysisId
            ? {
                ...item,
                status: 'review',
                score: item.score,
                result: item.result || outcome.previewResult || current.result,
                revision: item.revision + 1,
                updatedAt: new Date().toISOString()
              }
            : item
        )
      }
      persist()
      hostEvent('resume_match_save_result')
    }, delay)
  }
}

// 允许 iframe 刷新后继续使用预览状态。
window.__previewState = () => state
window.__previewSendInit = sendInit
