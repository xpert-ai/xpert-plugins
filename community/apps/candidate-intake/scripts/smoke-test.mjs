import assert from 'node:assert/strict'
import { CandidateIntakeService } from '../dist/index.js'
import { renderCandidatePage } from '../dist/lib/candidate-intake.controller.js'

class MemoryRepository {
  constructor() {
    this.items = []
    this.nextId = 1
  }

  create(value) {
    return { ...value }
  }

  async save(value) {
    if (!value.id) {
      value.id = `id-${this.nextId++}`
      value.createdAt = new Date()
    }
    value.updatedAt = new Date()
    const index = this.items.findIndex((item) => item.id === value.id)
    if (index === -1) this.items.push(value)
    else this.items[index] = value
    return value
  }

  async findOneBy(where) {
    return this.items.find((item) => matches(item, where)) ?? null
  }

  async findOne({ where }) {
    return this.findOneBy(where)
  }

  async find({ where }) {
    return this.items.filter((item) => matches(item, where))
  }

  createQueryBuilder() {
    const repository = this
    const filters = []
    return {
      addSelect() { return this },
      where(sql, params) { filters.push([sql, params]); return this },
      andWhere(sql, params) { filters.push([sql, params]); return this },
      async getOne() {
        return repository.items.find((item) => filters.every(([sql, params]) => {
          if (sql.includes('tokenHash')) return item.tokenHash === params.tokenHash
          if (sql.includes('application.id')) return item.id === params.applicationId
          if (sql.includes('tenantId')) {
            return (item.tenantId ?? null) === (params.tenantId ?? null) &&
              (item.organizationId ?? null) === (params.organizationId ?? null)
          }
          return true
        })) ?? null
      }
    }
  }
}

function matches(item, where) {
  return Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object' && value._type === 'isNull') return item[key] == null
    return item[key] === value
  })
}

const jobs = new MemoryRepository()
const applications = new MemoryRepository()
const service = new CandidateIntakeService(jobs, applications)
const scope = { tenantId: 'tenant-1', organizationId: 'org-1', userId: 'hr-1' }

const candidateHtml = renderCandidatePage('a'.repeat(43))
assert.match(candidateHtml, /教育经历/)
assert.match(candidateHtml, /工作经历/)
assert.match(candidateHtml, /岗位补充问题/)
assert.ok(candidateHtml.indexOf('简历 PDF') < candidateHtml.indexOf('候选人基本信息'), 'resume upload must appear before profile fields')
assert.equal(candidateHtml.includes('requiredCriteria'), false)
const embeddedScript = candidateHtml.match(/<script>([\s\S]+)<\/script>/)?.[1]
assert.ok(embeddedScript)
new Function(embeddedScript)
assert.match(embeddedScript, /const f=e\.currentTarget;try\{await save\(true\)/, 'submit must retain the form before awaiting')

const job = await service.createJob(scope, {
  companyName: '示例科技',
  roleName: '前端工程师',
  roleDescription: '负责业务系统前端开发。',
  requiredCriteria: ['三年 React 经验'],
  preferredCriteria: ['有 Agent 产品经验'],
  questions: [{ id: 'notice', label: '最早何时到岗？', required: true }]
})
job.active = true
const invitation = await service.createInvitation(scope, job.id, 3)
assert.equal(invitation.token.length >= 32, true)
assert.equal(applications.items[0].tokenHash === invitation.token, false, 'raw invitation token must not be stored')

let publicView = await service.getPublicApplication(invitation.token)
assert.equal('requiredCriteria' in publicView.job, false, 'internal criteria must stay private')
assert.equal('screeningResult' in publicView, false, 'screening data must stay private')

await service.saveDraft(invitation.token, {
  name: '候选人甲',
  email: 'candidate@example.com',
  identity: 'experienced',
  workYears: '3_5',
  education: [{ id: 'edu_1', school: '示例大学', major: '软件工程', degree: '本科' }],
  skills: ['React', 'TypeScript'],
  answers: {}
})
applications.items[0].resumeFileName = 'resume.pdf'
applications.items[0].resumeText = '候选人甲，React 前端工程师。'
applications.items[0].photoFileName = 'personal-photo.jpg'
applications.items[0].parseError = 'The PDF contains no selectable text.'
const failedDraft = await service.saveDraft(invitation.token, { abilitySummary: '手动补充的信息' })
assert.equal(failedDraft.status, 'parse_failed', 'editing must not bypass a failed PDF parse')
applications.items[0].parseError = null
applications.items[0].status = 'draft'

await assert.rejects(
  service.submit(invitation.token, { informationConsent: true, accuracyConfirmed: true }),
  /Please answer/
)
await service.saveDraft(invitation.token, { answers: { notice: '两周内' } })
await service.submit(invitation.token, { informationConsent: true, accuracyConfirmed: true })
await service.startScreening(scope, applications.items[0].id)
const agentContext = await service.getAgentScreeningContext(scope, applications.items[0].id)
assert.equal('photoFileName' in agentContext, false, 'photo metadata must stay outside Agent context')
await service.reportScreeningFailure(scope, applications.items[0].id, 'Temporary model failure')
assert.equal(applications.items[0].status, 'screening_failed')
await service.startScreening(scope, applications.items[0].id)
assert.equal(applications.items[0].status, 'screening', 'failed screening must be retryable')
await assert.rejects(
  service.saveScreening(scope, applications.items[0].id, {
    summary: '不完整结果', requiredFindings: [], preferredFindings: [], strengths: [], concerns: [], followUpQuestions: []
  }),
  /exactly one finding/
)
await service.saveScreening(scope, applications.items[0].id, {
  summary: '资料显示基础条件符合。',
  requiredFindings: [{ criterion: '三年 React 经验', status: 'met', evidence: '3–5 年；技能 React', explanation: '资料直接体现。' }],
  preferredFindings: [{ criterion: '有 Agent 产品经验', status: 'not_evidenced', explanation: '资料未体现。' }],
  strengths: ['React 与 TypeScript'],
  concerns: ['Agent 经验待确认'],
  followUpQuestions: ['是否参与过 Agent 产品？']
})
await assert.rejects(service.confirmDecision(scope, applications.items[0].id, 'invalid'), /Invalid HR decision/)
const confirmed = await service.confirmDecision(scope, applications.items[0].id, 'advance', '安排技术面试')
assert.equal(confirmed.status, 'confirmed')
assert.equal('photoData' in confirmed, false, 'photo bytes must never enter HR or Agent detail payloads')

publicView = await service.getPublicApplication(invitation.token)
assert.equal(publicView.status, 'confirmed')
applications.items[0].expiresAt = new Date(0)
await service.reopen(scope, applications.items[0].id)
assert.equal(applications.items[0].status, 'draft')
assert.equal(applications.items[0].expiresAt.getTime() > Date.now(), true, 'reopening must renew the candidate link')
console.log('Candidate Intake service smoke test passed.')
