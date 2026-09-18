import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const componentRoot = dirname(fileURLToPath(import.meta.url))
const pluginRoot = resolve(componentRoot, '../../../..')

const job = {
  id: 'job-1',
  companyName: '星河智能科技有限公司',
  roleName: 'AI 应用前端工程师',
  roleDescription: '负责企业级 Agent 应用与业务工作台的前端开发。',
  requiredCriteria: ['3 年以上前端开发经验', '熟练使用 React 与 TypeScript', '能够独立完成业务模块交付'],
  preferredCriteria: ['有 AI 或 Agent 产品经验', '有复杂表单与数据工作台经验']
}

const selected = {
  id: 'application-1', jobId: job.id, status: 'pending_review', candidateName: '林晓宇',
  contact: 'lin.xiaoyu@example.com', updatedAt: '2026-09-17T01:00:00.000Z',
  profile: { identity: 'experienced', workYears: '3_5', highestDegree: '本科', abilitySummary: '4 年 B 端前端开发经验，熟悉 React、TypeScript 和复杂表单，有智能客服 Agent 项目交付经验。' },
  job,
  screeningResult: {
    summary: '候选人的前端技术栈与交付经验符合主要要求，Agent 产品经验有直接项目证据。建议 HR 重点确认其复杂业务架构能力。',
    requiredFindings: [
      { criterion: '3 年以上前端开发经验', status: 'met', evidence: '工作年限 3–5 年；两段连续前端工作经历', explanation: '简历资料直接体现。' },
      { criterion: '熟练使用 React 与 TypeScript', status: 'met', evidence: '技能列表及两个项目均提到 React、TypeScript', explanation: '技能与项目证据一致。' },
      { criterion: '能够独立完成业务模块交付', status: 'partially_met', evidence: '负责候选人管理模块开发', explanation: '体现模块负责经历，独立承担范围需要面试确认。' }
    ],
    preferredFindings: [
      { criterion: '有 AI 或 Agent 产品经验', status: 'met', evidence: '智能客服 Agent 项目，负责会话工作台', explanation: '项目经历直接体现。' },
      { criterion: '有复杂表单与数据工作台经验', status: 'met', evidence: '招聘 SaaS 候选人管理工作台', explanation: '项目内容与条件一致。' }
    ],
    strengths: ['React 与 TypeScript 项目经验完整', '有 Agent 产品交付经历'],
    concerns: ['独立负责的系统边界需进一步确认'],
    followUpQuestions: ['请说明 Agent 会话工作台中最复杂的技术问题及解决方法。']
  }
}

const state = {
  jobs: [job],
  applications: [
    { id: selected.id, jobId: job.id, status: selected.status, candidateName: selected.candidateName, contact: selected.contact, updatedAt: selected.updatedAt },
    { id: 'application-2', jobId: job.id, status: 'submitted', candidateName: '周宁', contact: '13800138000', updatedAt: '2026-09-16T08:00:00.000Z' }
  ],
  selected
}

export default {
  title: '候选人招聘登记 · HR 工作台预览',
  workspaceRoot: pluginRoot,
  instanceId: 'candidate-intake-preview',
  component: { root: componentRoot, runtime: 'react' },
  hostContext: {
    manifest: { key: 'candidate_intake__hr_workbench' }, payload: {},
    initialQuery: { pageSize: 30 }, locale: 'zh-Hans',
    theme: { mode: 'light', tokens: { background: '#f5f7fb', foreground: '#172033', primary: '#1d4ed8', border: '#e2e8f0' } }
  },
  state,
  async handleRequest(message, { state }) {
    if (message.type === 'requestData') return { data: { item: state } }
    if (message.type === 'executeAction') return { result: { success: true, data: {} } }
    if (message.type === 'invokeClientCommand') return { result: { success: true } }
    throw new Error(`Unsupported preview request '${message.type}'`)
  }
}
