// Production UI and domain services with fictional, in-memory repositories.
// This adapter never calls a model or modifies the real platform database.
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CANDIDATES, DIMENSIONS, JD, SCOPE, createFakeRepository } from '../../../../tests/fake-repo.mjs'
import { ResumeScreeningService } from '../../../../dist/lib/resume-screening.service.js'
import { ResumeScreeningViewProvider } from '../../../../dist/lib/resume-screening-view.provider.js'

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const scope = { ...SCOPE, assistantId: 'preview-assistant' }
const context = { ...scope, hostType: 'agent', hostId: scope.assistantId }

function adapter(state) {
  const screenings = createFakeRepository(state.screenings), scores = createFakeRepository(state.scores)
  const candidates = createFakeRepository(state.candidates, { scores }), tasks = createFakeRepository(state.tasks)
  const service = new ResumeScreeningService(screenings, candidates, scores, tasks)
  return { service, provider: new ResumeScreeningViewProvider(service),
    persist() { Object.assign(state, { screenings: screenings.rows, candidates: candidates.rows, scores: scores.rows, tasks: tasks.rows }) } }
}

async function fixture() {
  const state = { screenings: [], candidates: [], scores: [], tasks: [], sentMessages: [],
    failNextConfirmation: process.env.RESUME_PREVIEW_FAIL_ONCE === '1',
    failNextSend: process.env.RESUME_PREVIEW_SEND_FAIL_ONCE === '1',
    failNextEdit: process.env.RESUME_PREVIEW_EDIT_FAIL_ONCE === '1' }
  const { service, persist } = adapter(state)
  const screening = await service.createScreening(scope, JD)
  for (const [key, data] of Object.entries(CANDIDATES)) {
    const candidate = await service.addCandidate(scope, { ...data, screeningId: screening.id })
    await service.prescreenResume(scope, screening.id, candidate.id)
    await service.saveScore(scope, { screeningId: screening.id, candidateId: candidate.id,
      dimensions: key === 'senior' ? DIMENSIONS : DIMENSIONS.map((item) => ({ ...item, score: 8 })) })
    if (key === 'senior') await service.confirmScreening(scope, { screeningId: screening.id,
      candidateId: candidate.id, decision: 'interview', baseRevision: 1, note: '虚构本地预览材料，非真实招聘结论。' })
  }
  await service.createScreening(scope, { ...JD, title: 'Go 服务开发筛查（虚构空单）', jobTitle: 'Go 服务开发',
    jdText: '虚构岗位：负责 Go 后端服务，需要 3 年经验、本科学历，具备 Go 与 PostgreSQL 项目证据。',
    minYears: 3, requiredSkills: ['Go', 'PostgreSQL'] })
  persist()
  return state
}

export default {
  title: 'Resume Screening · Local mock preview', workspaceRoot: pluginRoot, instanceId: 'resume-screening-preview',
  component: { root: resolve(pluginRoot, 'dist/lib/remote-components/resume_screening__remote'), runtime: 'react', viewportBound: true },
  hostContext: { manifest: { key: 'resume_screening' }, payload: {}, initialQuery: { pageSize: 20, parameters: {} },
    locale: 'zh-Hans', theme: { mode: 'light', tokens: { background: '#ffffff', foreground: '#17202a', primary: '#0f766e', border: '#e2e8f0' } } },
  state: await fixture(),
  async handleRequest(message, { state }) {
    if (message.type === 'invokeClientCommand') {
      if (message.commandKey === 'assistant.context.set') return { result: { success: true } }
      if (message.commandKey !== 'assistant.chat.send_message') return { result: { success: false, message: 'Unsupported command' } }
      const text = message.payload?.text ?? message.payload?.input
      if (typeof text !== 'string' || !text.trim()) return { result: { success: false, message: 'Message text required' } }
      if (state.failNextSend) { state.failNextSend = false; return { result: { success: false, message: 'Simulated assistant unavailable' } } }
      state.sentMessages.push(text)
      return { result: { success: true, status: 'sent' } }
    }
    const current = adapter(state)
    try {
      if (message.type === 'requestData') return { data: await current.provider.getViewData(context, 'workbench', message.query ?? {}) }
      if (message.type === 'executeAction') {
        if (message.actionKey === 'confirm_candidate' && state.failNextConfirmation) {
          state.failNextConfirmation = false
          return { result: { success: false, message: 'Simulated save failure' } }
        }
        if (['update_candidate', 'update_screening'].includes(message.actionKey) && state.failNextEdit) {
          state.failNextEdit = false
          return { result: { success: false, message: 'Simulated edit save failure' } }
        }
        return { result: await current.provider.executeViewAction(context, 'workbench', message.actionKey,
          { targetId: message.targetId, input: message.input, parameters: message.parameters }) }
      }
      throw new Error(`Unsupported preview request '${message.type}'`)
    } finally { current.persist() }
  }
}
