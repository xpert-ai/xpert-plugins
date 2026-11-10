// Local preview for the Resume Screening workbench, rendered by
// `node tools/remote-view-preview/cli.mjs --config <this file>`.
// All candidates are fictional (same fixtures as tests/fake-repo.mjs).
// No real personal data or credentials. Not a real Xpert platform run:
// requestData / actions are answered from in-memory state.
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const configDir = dirname(fileURLToPath(import.meta.url))
const pluginRoot = resolve(configDir, '../../../..')
const componentRoot = resolve(pluginRoot, 'dist/lib/remote-components/resume_screening__remote')

const candidates = [
  {
    candidateId: 'c1',
    name: '陈晓峰',
    yearsOfExperience: 8,
    degree: 'master',
    skills: ['Java', 'Spring Boot', 'MySQL', 'Redis'],
    prescreen: [],
    totalScore: 72,
    decision: 'interview',
    suggestedDecision: 'interview',
    note: '已电话确认，周三下午面试。',
    revision: 2
  },
  {
    candidateId: 'c2',
    name: '赵敏',
    yearsOfExperience: 5,
    degree: 'bachelor',
    skills: ['Java', 'Spring Boot', 'MySQL'],
    prescreen: [],
    totalScore: 64,
    decision: null,
    suggestedDecision: 'pending',
    note: null,
    revision: 1
  },
  {
    candidateId: 'c3',
    name: '王磊',
    yearsOfExperience: 6,
    degree: 'associate',
    skills: ['Java', 'Spring Boot', 'MySQL'],
    prescreen: [
      {
        rule: 'R-02',
        severity: 'error',
        message: 'Degree associate is below the JD minimum bachelor.',
        evidence: '6 年 Java 开发经验，大专学历。熟悉 Java、Spring Boot、MySQL，有电商后台经验。'
      }
    ],
    totalScore: 55,
    decision: 'pending',
    suggestedDecision: 'pending',
    note: null,
    revision: 1
  },
  {
    candidateId: 'c4',
    name: '林涛',
    yearsOfExperience: 3,
    degree: 'bachelor',
    skills: ['Java'],
    prescreen: [
      {
        rule: 'R-01',
        severity: 'error',
        message: 'Years of experience 3 is below the JD minimum 5.',
        evidence: '3 年 Java 开发经验，本科学历。做过两个内部管理系统，主要使用 Java。'
      },
      {
        rule: 'R-03',
        severity: 'warning',
        message: 'Required skills not found: Spring Boot, MySQL.',
        evidence: '3 年 Java 开发经验，本科学历。做过两个内部管理系统，主要使用 Java。'
      }
    ],
    totalScore: 38,
    decision: null,
    suggestedDecision: 'rejected',
    note: null,
    revision: 1
  }
]

export default {
  title: 'Resume Screening Workbench · Local Preview',
  workspaceRoot: pluginRoot,
  instanceId: 'resume-screening-preview',
  component: { root: componentRoot, runtime: 'react' },
  hostContext: {
    manifest: { key: 'resume_screening' },
    payload: {},
    initialQuery: { pageSize: 20, parameters: {} },
    locale: 'zh-Hans',
    theme: {
      mode: 'light',
      tokens: { background: '#ffffff', foreground: '#17202a', primary: '#0f766e', border: '#e2e8f0' }
    }
  },
  state: { candidates },
  async handleRequest(message, { state }) {
    if (message.type === 'requestData') {
      const search = String(message.query?.search ?? '').trim()
      const page = Number(message.query?.page ?? 1)
      const pageSize = Number(message.query?.pageSize ?? 20)
      let items = [...state.candidates]
      if (search) {
        items = items.filter(
          (candidate) => candidate.name.includes(search) || candidate.skills.join(' ').includes(search)
        )
      }
      items.sort((a, b) => (b.totalScore ?? -1) - (a.totalScore ?? -1))
      const total = items.length
      items = items.slice((page - 1) * pageSize, page * pageSize)
      return {
        data: {
          items,
          total,
          summary: {
            page,
            pageSize,
            screeningId: 'screening-demo-001',
            title: 'Java 高级开发筛查（2026 年 11 月）',
            jobTitle: 'Java 高级开发',
            status: 'reviewing'
          }
        }
      }
    }
    if (message.type === 'executeAction') {
      if (message.actionKey === 'confirm_candidate') {
        const row = state.candidates.find((candidate) => candidate.candidateId === message.targetId)
        if (!row) throw new Error('Candidate not found')
        if (message.input?.baseRevision !== undefined && message.input.baseRevision !== row.revision) {
          throw new Error('revision_conflict')
        }
        if (message.input?.decision) row.decision = message.input.decision
        if (message.input?.adjustedTotal !== undefined) row.totalScore = message.input.adjustedTotal
        if (message.input?.note !== undefined) row.note = message.input.note
        row.revision += 1
        return { result: { success: true, data: row } }
      }
      if (message.actionKey === 'create_screening' || message.actionKey === 'add_candidate') {
        return { result: { success: true } }
      }
      throw new Error(`Unsupported action '${message.actionKey}'`)
    }
    if (message.type === 'invokeClientCommand') {
      return { result: { success: true } }
    }
    throw new Error(`Unsupported preview request '${message.type}'`)
  }
}
