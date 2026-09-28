import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import pdf from 'pdf-parse'
import { IsNull, Repository } from 'typeorm'
import { CandidateApplication, CandidateJob } from './entities/index.js'
import type {
  CandidateProfile,
  CandidateScope,
  HrDecision,
  JobQuestion,
  ScreeningResult
} from './types.js'

const EMPTY_PROFILE: CandidateProfile = {
  education: [],
  skills: [],
  experiences: [],
  projects: [],
  certificates: [],
  answers: {}
}

@Injectable()
export class CandidateIntakeService {
  constructor(
    @InjectRepository(CandidateJob) private readonly jobRepository: Repository<CandidateJob>,
    @InjectRepository(CandidateApplication)
    private readonly applicationRepository: Repository<CandidateApplication>
  ) {}

  async createJob(
    scope: CandidateScope,
    input: {
      companyName: string
      roleName: string
      roleDescription: string
      requiredCriteria?: string[]
      preferredCriteria?: string[]
      questions?: JobQuestion[]
      defaultExpiryDays?: number
    }
  ) {
    const job = this.jobRepository.create({
      tenantId: scope.tenantId ?? null,
      organizationId: scope.organizationId ?? null,
      companyName: requireText(input.companyName, 'Company name is required.'),
      roleName: requireText(input.roleName, 'Role name is required.'),
      roleDescription: requireText(input.roleDescription, 'Role description is required.'),
      requiredCriteria: normalizeTextList(input.requiredCriteria),
      preferredCriteria: normalizeTextList(input.preferredCriteria),
      questions: normalizeQuestions(input.questions),
      defaultExpiryDays: clampExpiryDays(input.defaultExpiryDays),
      createdById: scope.userId ?? null
    })
    return this.jobRepository.save(job)
  }

  async createInvitation(scope: CandidateScope, jobId: string, expiryDays?: number) {
    const job = await this.requireScopedJob(scope, jobId)
    const token = randomBytes(32).toString('base64url')
    const days = clampExpiryDays(expiryDays ?? job.defaultExpiryDays)
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    const application = this.applicationRepository.create({
      tenantId: scope.tenantId ?? null,
      organizationId: scope.organizationId ?? null,
      jobId: job.id,
      tokenHash: hashToken(token),
      tokenHint: token.slice(-8),
      status: 'invited',
      expiresAt,
      profile: { ...EMPTY_PROFILE },
      createdById: scope.userId ?? null
    })
    const saved = await this.applicationRepository.save(application)
    return {
      applicationId: saved.id,
      token,
      path: `/api/candidate-intake/apply/${token}`,
      expiresAt: saved.expiresAt
    }
  }

  async getPublicApplication(token: string) {
    const application = await this.requireByToken(token)
    const job = await this.jobRepository.findOneBy({ id: application.jobId })
    if (!job || !job.active) throw new NotFoundException('Invitation is unavailable.')
    const status = this.getEffectiveStatus(application)
    return {
      id: application.id,
      status,
      expiresAt: application.expiresAt,
      submittedAt: application.submittedAt,
      profile: application.profile,
      resume: application.resumeFileName
        ? { fileName: application.resumeFileName, ready: true }
        : null,
      photo: application.photoFileName ? { fileName: application.photoFileName } : null,
      informationConsent: application.informationConsent,
      accuracyConfirmed: application.accuracyConfirmed,
      job: {
        companyName: job.companyName,
        roleName: job.roleName,
        roleDescription: job.roleDescription,
        questions: job.questions
      }
    }
  }

  async saveDraft(token: string, input: Partial<CandidateProfile>) {
    const application = await this.requireEditableByToken(token)
    application.profile = normalizeProfile(input, application.profile)
    application.status = application.parseError ? 'parse_failed' : 'draft'
    await this.applicationRepository.save(application)
    return this.getPublicApplication(token)
  }

  async uploadResume(token: string, file: Express.Multer.File) {
    const application = await this.requireEditableByToken(token)
    ensurePdf(file)
    application.resumeFileName = safeFileName(file.originalname, 'resume.pdf')
    application.resumeMimeType = 'application/pdf'
    application.resumeData = file.buffer
    try {
      const parsed = await pdf(file.buffer)
      const resumeText = normalizeResumeText(parsed.text)
      if (!resumeText) throw new Error('The PDF contains no selectable text.')
      application.resumeText = resumeText
      application.profile = normalizeProfile(prefillFromResume(resumeText), application.profile)
      application.status = 'draft'
      application.parseError = null
    } catch (error) {
      application.resumeText = null
      application.status = 'parse_failed'
      application.parseError = error instanceof Error ? error.message : 'PDF parsing failed.'
    }
    await this.applicationRepository.save(application)
    return {
      status: application.status,
      profile: application.profile,
      parseError: application.parseError,
      resume: { fileName: application.resumeFileName, ready: true }
    }
  }

  async uploadPhoto(token: string, file: Express.Multer.File) {
    const application = await this.requireEditableByToken(token)
    ensurePhoto(file)
    application.photoFileName = safeFileName(file.originalname, 'photo')
    application.photoMimeType = file.mimetype
    application.photoData = file.buffer
    application.status = application.parseError ? 'parse_failed' : 'draft'
    await this.applicationRepository.save(application)
    return { fileName: application.photoFileName }
  }

  async submit(token: string, input: { informationConsent?: boolean; accuracyConfirmed?: boolean }) {
    const application = await this.requireEditableByToken(token)
    const profile = application.profile
    const job = await this.jobRepository.findOneBy({ id: application.jobId })
    if (!profile.name?.trim()) throw new BadRequestException('Candidate name is required.')
    if (!profile.phone?.trim() && !profile.email?.trim()) {
      throw new BadRequestException('A phone number or email address is required.')
    }
    if (!profile.identity || !profile.workYears) {
      throw new BadRequestException('Candidate identity and work experience are required.')
    }
    if (!application.resumeFileName) throw new BadRequestException('A PDF resume is required.')
    if (application.parseError) throw new BadRequestException('Resolve the resume parsing error before submitting.')
    const unanswered = (job?.questions ?? []).find(
      (question) => question.required && !profile.answers?.[question.id]?.trim()
    )
    if (unanswered) throw new BadRequestException(`Please answer: ${unanswered.label}`)
    if (!input.informationConsent || !input.accuracyConfirmed) {
      throw new BadRequestException('Both consent confirmations are required.')
    }
    application.informationConsent = true
    application.accuracyConfirmed = true
    application.status = 'submitted'
    application.submittedAt = new Date()
    await this.applicationRepository.save(application)
    return { status: application.status, submittedAt: application.submittedAt }
  }

  async getResumeByToken(token: string) {
    const application = await this.applicationRepository
      .createQueryBuilder('application')
      .addSelect('application.resumeData')
      .where('application.tokenHash = :tokenHash', { tokenHash: hashToken(token) })
      .getOne()
    if (!application?.resumeData) throw new NotFoundException('Resume not found.')
    return {
      data: application.resumeData,
      fileName: application.resumeFileName ?? 'resume.pdf',
      mimeType: application.resumeMimeType ?? 'application/pdf'
    }
  }

  async getWorkbenchData(scope: CandidateScope, applicationId?: string) {
    const jobs = await this.jobRepository.find({
      where: scopeWhere(scope),
      order: { createdAt: 'DESC' }
    })
    const applications = await this.applicationRepository.find({
      where: scopeWhere(scope),
      order: { updatedAt: 'DESC' }
    })
    const selected = applicationId
      ? applications.find((item) => item.id === applicationId) ?? null
      : applications[0] ?? null
    return {
      jobs,
      applications: applications.map(toApplicationSummary),
      selected: selected ? await this.getScopedApplicationDetail(scope, selected.id) : null
    }
  }

  async getScopedApplicationDetail(scope: CandidateScope, applicationId: string) {
    const application = await this.applicationRepository
      .createQueryBuilder('application')
      .addSelect('application.resumeText')
      .where('application.id = :applicationId', { applicationId })
      .andWhere(scopeSql(scope), scopeParameters(scope))
      .getOne()
    if (!application) throw new NotFoundException('Application not found.')
    const job = await this.requireScopedJob(scope, application.jobId)
    return {
      ...toApplicationSummary(application),
      profile: application.profile,
      resumeText: application.resumeText,
      screeningResult: application.screeningResult,
      screeningError: application.screeningError,
      hrDecision: application.hrDecision,
      hrNote: application.hrNote,
      job
    }
  }

  async getAgentScreeningContext(scope: CandidateScope, applicationId: string) {
    const detail = await this.getScopedApplicationDetail(scope, applicationId)
    // File names can contain personal information, so even photo metadata stays outside Agent context.
    const { photoFileName: _photoFileName, ...safeDetail } = detail
    return safeDetail
  }

  async startScreening(scope: CandidateScope, applicationId: string) {
    const application = await this.requireScopedApplication(scope, applicationId)
    if (!['submitted', 'screening_failed', 'pending_review'].includes(application.status)) {
      throw new BadRequestException('Only submitted applications can be screened.')
    }
    application.status = 'screening'
    application.screeningError = null
    await this.applicationRepository.save(application)
    return this.getScopedApplicationDetail(scope, applicationId)
  }

  async saveScreening(scope: CandidateScope, applicationId: string, result: Omit<ScreeningResult, 'generatedAt'>) {
    const application = await this.requireScopedApplication(scope, applicationId)
    if (application.status !== 'screening') {
      throw new BadRequestException('Screening results can only be saved while screening is in progress.')
    }
    const job = await this.requireScopedJob(scope, application.jobId)
    validateScreeningFindings(job.requiredCriteria, result.requiredFindings, 'required')
    validateScreeningFindings(job.preferredCriteria, result.preferredFindings, 'preferred')
    application.screeningResult = { ...result, generatedAt: new Date().toISOString() }
    application.screeningError = null
    application.status = 'pending_review'
    await this.applicationRepository.save(application)
    return this.getScopedApplicationDetail(scope, applicationId)
  }

  async reportScreeningFailure(scope: CandidateScope, applicationId: string, errorMessage: string) {
    const application = await this.requireScopedApplication(scope, applicationId)
    if (application.status !== 'screening') {
      throw new BadRequestException('Only an in-progress screening can be marked as failed.')
    }
    application.status = 'screening_failed'
    application.screeningError = requireText(errorMessage, 'Error message is required.')
    await this.applicationRepository.save(application)
    return { id: application.id, status: application.status, screeningError: application.screeningError }
  }

  async confirmDecision(scope: CandidateScope, applicationId: string, decision: HrDecision, note?: string) {
    const application = await this.requireScopedApplication(scope, applicationId)
    if (application.status !== 'pending_review') {
      throw new BadRequestException('Screening must be reviewed before a final decision.')
    }
    if (!['advance', 'request_information', 'reject'].includes(decision)) {
      throw new BadRequestException('Invalid HR decision.')
    }
    application.hrDecision = decision
    application.hrNote = normalizeOptionalText(note)
    application.status = 'confirmed'
    application.confirmedAt = new Date()
    await this.applicationRepository.save(application)
    return this.getScopedApplicationDetail(scope, applicationId)
  }

  async reopen(scope: CandidateScope, applicationId: string) {
    const application = await this.requireScopedApplication(scope, applicationId)
    const job = await this.requireScopedJob(scope, application.jobId)
    application.status = 'draft'
    application.expiresAt = new Date(Date.now() + job.defaultExpiryDays * 24 * 60 * 60 * 1000)
    application.submittedAt = null
    application.screeningResult = null
    application.screeningError = null
    application.hrDecision = null
    application.hrNote = null
    application.confirmedAt = null
    await this.applicationRepository.save(application)
    return { id: application.id, status: application.status }
  }

  private async requireByToken(token: string) {
    if (!token || token.length < 32) throw new NotFoundException('Invitation not found.')
    const application = await this.applicationRepository
      .createQueryBuilder('application')
      .where('application.tokenHash = :tokenHash', { tokenHash: hashToken(token) })
      .getOne()
    if (!application) throw new NotFoundException('Invitation not found.')
    return application
  }

  private async requireEditableByToken(token: string) {
    const application = await this.requireByToken(token)
    const status = this.getEffectiveStatus(application)
    if (status === 'expired') throw new BadRequestException('This invitation has expired.')
    if (['submitted', 'screening', 'pending_review', 'confirmed'].includes(status)) {
      throw new BadRequestException('This application has already been submitted.')
    }
    return application
  }

  private getEffectiveStatus(application: CandidateApplication) {
    if (application.expiresAt.getTime() < Date.now() && !application.submittedAt) return 'expired' as const
    return application.status
  }

  private async requireScopedJob(scope: CandidateScope, id: string) {
    const job = await this.jobRepository.findOne({ where: { id, ...scopeWhere(scope) } })
    if (!job) throw new NotFoundException('Job not found.')
    return job
  }

  private async requireScopedApplication(scope: CandidateScope, id: string) {
    const application = await this.applicationRepository.findOne({ where: { id, ...scopeWhere(scope) } })
    if (!application) throw new NotFoundException('Application not found.')
    return application
  }
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function scopeWhere(scope: CandidateScope) {
  return {
    tenantId: scope.tenantId ? scope.tenantId : IsNull(),
    organizationId: scope.organizationId ? scope.organizationId : IsNull()
  }
}

function scopeSql(scope: CandidateScope) {
  return 'application.tenantId IS NOT DISTINCT FROM :tenantId AND application.organizationId IS NOT DISTINCT FROM :organizationId'
}

function scopeParameters(scope: CandidateScope) {
  return { tenantId: scope.tenantId ?? null, organizationId: scope.organizationId ?? null }
}

function requireText(value: string | undefined, message: string) {
  const normalized = value?.trim()
  if (!normalized) throw new BadRequestException(message)
  return normalized
}

function normalizeOptionalText(value: string | undefined | null) {
  const normalized = value?.trim()
  return normalized || null
}

function normalizeTextList(values?: string[]) {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))]
}

function normalizeQuestions(values?: JobQuestion[]) {
  return (values ?? [])
    .map((question) => ({
      id: question.id?.trim() || randomUUID(),
      label: question.label?.trim(),
      required: Boolean(question.required)
    }))
    .filter((question): question is JobQuestion => Boolean(question.label))
}

function clampExpiryDays(value?: number) {
  if (!Number.isFinite(value)) return 7
  return Math.min(30, Math.max(1, Math.round(value ?? 7)))
}

function normalizeProfile(input: Partial<CandidateProfile>, current: CandidateProfile): CandidateProfile {
  const identity = input.identity ?? current.identity
  const workYears = input.workYears ?? current.workYears
  return {
    name: cleanOptionalText(input.name ?? current.name, 120),
    phone: cleanOptionalText(input.phone ?? current.phone, 60),
    email: cleanOptionalText(input.email ?? current.email, 320),
    currentCity: cleanOptionalText(input.currentCity ?? current.currentCity, 120),
    identity: ['intern_student', 'fresh_graduate', 'experienced'].includes(String(identity))
      ? identity
      : undefined,
    workYears: ['none', 'lt_1', '1_3', '3_5', '5_10', '10_plus'].includes(String(workYears))
      ? workYears
      : undefined,
    earliestAvailability: cleanOptionalText(input.earliestAvailability ?? current.earliestAvailability, 40),
    highestDegree: cleanOptionalText(input.highestDegree ?? current.highestDegree, 100),
    education: Array.isArray(input.education)
      ? input.education.slice(0, 20).map((entry) => ({
          id: cleanId(entry.id),
          degree: cleanText(entry.degree),
          school: cleanText(entry.school),
          major: cleanText(entry.major),
          startDate: cleanOptionalText(entry.startDate),
          endDate: cleanOptionalText(entry.endDate)
        }))
      : current.education ?? [],
    skills: Array.isArray(input.skills) ? normalizeTextList(input.skills) : current.skills ?? [],
    abilitySummary: cleanOptionalText(input.abilitySummary ?? current.abilitySummary, 4_000),
    experiences: Array.isArray(input.experiences)
      ? input.experiences.slice(0, 30).map((entry) => ({
          id: cleanId(entry.id),
          company: cleanText(entry.company),
          title: cleanText(entry.title),
          startDate: cleanOptionalText(entry.startDate),
          endDate: cleanOptionalText(entry.endDate),
          description: cleanOptionalText(entry.description, 4_000)
        }))
      : current.experiences ?? [],
    projects: Array.isArray(input.projects)
      ? input.projects.slice(0, 30).map((entry) => ({
          id: cleanId(entry.id),
          name: cleanText(entry.name),
          role: cleanOptionalText(entry.role),
          description: cleanOptionalText(entry.description, 4_000)
        }))
      : current.projects ?? [],
    certificates: Array.isArray(input.certificates)
      ? normalizeTextList(input.certificates)
      : current.certificates ?? [],
    portfolioUrl: cleanOptionalText(input.portfolioUrl ?? current.portfolioUrl, 2_000),
    answers:
      input.answers && typeof input.answers === 'object'
        ? Object.fromEntries(
            Object.entries(input.answers)
              .slice(0, 50)
              .map(([key, value]) => [cleanId(key), cleanText(value, 4_000)])
          )
        : current.answers ?? {}
  }
}

function cleanId(value: unknown) {
  const normalized = String(value ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)
  return normalized || randomUUID()
}

function cleanText(value: unknown, maxLength = 500) {
  return String(value ?? '').trim().slice(0, maxLength)
}

function cleanOptionalText(value: unknown, maxLength = 500) {
  return cleanText(value, maxLength) || undefined
}

function ensurePdf(file: Express.Multer.File) {
  if (!file) throw new BadRequestException('A PDF file is required.')
  const extensionIsPdf = file.originalname.toLowerCase().endsWith('.pdf')
  const headerIsPdf = file.buffer.subarray(0, 5).toString('ascii') === '%PDF-'
  if (file.mimetype !== 'application/pdf' || !extensionIsPdf || !headerIsPdf) {
    throw new BadRequestException('Only valid PDF files are accepted.')
  }
}

function ensurePhoto(file: Express.Multer.File) {
  if (!file) throw new BadRequestException('A JPG or PNG photo is required.')
  const isJpeg = file.mimetype === 'image/jpeg' &&
    file.buffer.length >= 3 && file.buffer[0] === 0xff && file.buffer[1] === 0xd8 && file.buffer[2] === 0xff
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const isPng = file.mimetype === 'image/png' &&
    file.buffer.length >= pngSignature.length && file.buffer.subarray(0, pngSignature.length).equals(pngSignature)
  if (!isJpeg && !isPng) throw new BadRequestException('Only valid JPG and PNG photos are supported.')
}

function safeFileName(value: string, fallback: string) {
  const cleaned = value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim()
  return cleaned.slice(0, 200) || fallback
}

function normalizeResumeText(value: string) {
  return value.replace(/\u0000/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 80_000)
}

function prefillFromResume(text: string): Partial<CandidateProfile> {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]
  const phone = text.match(/(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)/)?.[0]
  const nameLine = lines.find((line) => /^[\u4e00-\u9fa5]{2,4}$/.test(line))
  const skillLine = lines.find((line) => /^(专业技能|技能|skills?)[:：]?/i.test(line))
  const degree = ['博士', '硕士', '本科', '大专'].find((item) => text.includes(item))
  return {
    name: nameLine,
    email,
    phone,
    highestDegree: degree,
    skills: skillLine
      ? skillLine.replace(/^(专业技能|技能|skills?)[:：]?/i, '').split(/[、,，/]/).map((item) => item.trim()).filter(Boolean)
      : [],
    abilitySummary: lines.slice(0, 8).join('；').slice(0, 500)
  }
}

function toApplicationSummary(application: CandidateApplication) {
  return {
    id: application.id,
    jobId: application.jobId,
    status: application.status,
    expiresAt: application.expiresAt,
    candidateName: application.profile?.name ?? '未填写',
    contact: application.profile?.email ?? application.profile?.phone ?? '',
    resumeFileName: application.resumeFileName,
    photoFileName: application.photoFileName,
    submittedAt: application.submittedAt,
    updatedAt: application.updatedAt,
    hrDecision: application.hrDecision
  }
}

function validateScreeningFindings(
  criteria: string[],
  findings: ScreeningResult['requiredFindings'],
  label: string
) {
  const expected = criteria.map((criterion) => criterion.trim())
  const actual = findings.map((finding) => finding.criterion.trim())
  const unique = new Set(actual)
  if (
    actual.length !== expected.length ||
    unique.size !== actual.length ||
    expected.some((criterion) => !unique.has(criterion))
  ) {
    throw new BadRequestException(`Screening must include exactly one finding for every ${label} criterion.`)
  }
}
