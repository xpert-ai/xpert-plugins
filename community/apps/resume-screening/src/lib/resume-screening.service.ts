import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { In, IsNull } from 'typeorm'
import { InjectRepository } from '@nestjs/typeorm'
import type { Repository } from 'typeorm'
import { ResumeCandidate } from './entities/resume-candidate.entity.js'
import { ResumeScore } from './entities/resume-score.entity.js'
import { ResumeScreening } from './entities/resume-screening.entity.js'
import { ResumeScoringTask } from './entities/resume-scoring-task.entity.js'
import { ResumeRevisionConflictError, ResumeCriteriaLockedError } from './revision-conflict.error.js'
import { screeningEditFields, screeningEditVersion, sameScreeningCriteria } from './screening-edit.js'
import { candidateFields, candidateEvidence, scoreState, uniqueSkills, scoreHistoryEntry } from './candidate-evidence.js'
import { DEGREE_RANK, SCORE_DIMENSIONS } from './types.js'
import type {
  AddCandidateInput,
  CandidateRow,
  ConfirmScreeningInput,
  CreateScreeningInput,
  PrescreenFinding,
  ResumeDecision,
  ResumeScope,
  ResumeWorkbenchData,
  ResumeWorkbenchQuery,
  ScoreDimensionInput,
  ScoreReceipt,
  UpdateScreeningInput,
  CandidateDetail, CandidateFields, ResumeScreeningStatus, ScreeningListItem, ScreeningListSummary
} from './types.js'

const MAX_EVIDENCE_LENGTH = 200
const MAX_RESUME_TEXT_LENGTH = 20000
const MAX_NOTE_LENGTH = 500
const DECISIONS: ResumeDecision[] = ['interview', 'pending', 'rejected']
function validateRequestId(value?: string) {
  if (value !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new BadRequestException('requestId must be a UUID.')
  }
}

function excerpt(text: string, needle: string, length = MAX_EVIDENCE_LENGTH): string {
  const index = needle ? text.toLowerCase().indexOf(needle.toLowerCase()) : -1
  const start = index >= 0 ? Math.max(0, index - 20) : 0
  const slice = text.slice(start, start + length)
  return slice.length < text.length ? `${slice}…` : slice
}

function normalizeSkill(skill: string): string {
  return skill
    .trim()
    .toLowerCase()
    .replace(/[\s\-_]+/g, '')
}

/**
 * Deliberate skill equivalences, keyed by normalized required skill.
 * 'springboot' accepts 'spring' and 'springframework' because they name the
 * same stack; 'mysql' deliberately does NOT accept 'sql' — SQL is a broader
 * skill, not evidence of MySQL. A merely related mention is a near-miss, not
 * a match (see prescreenCandidate).
 */
export const SKILL_ALIASES: Record<string, string[]> = {
  springboot: ['spring', 'springframework']
}

function skillMatches(required: string, candidateSkills: Set<string>): boolean {
  const normalized = normalizeSkill(required)
  if (candidateSkills.has(normalized)) return true
  return (SKILL_ALIASES[normalized] ?? []).some((alias) => candidateSkills.has(alias))
}

/**
 * Suggested outcome from the total score and prescreen findings. A suggestion
 * only — a human can override it in the Workbench. An error-level finding
 * (R-01/R-02) caps the suggestion at 'pending': hard-rule misses only
 * down-weight, they never auto-reject.
 */
export function suggestDecision(totalScore: number | null, hasErrorFinding: boolean): ResumeDecision | null {
  if (totalScore === null) return null
  if (totalScore >= 70) return hasErrorFinding ? 'pending' : 'interview'
  if (totalScore >= 50) return 'pending'
  return 'rejected'
}

/**
 * Deterministic prescreen rules. No model call happens here.
 * R-01: years of experience below the JD minimum.
 * R-02: degree level below the JD minimum.
 * R-03: required skills missing from the resume, merged into ONE warning
 * listing every missing skill. A candidate skill that merely mentions a
 * related term (e.g. "SQL" for required "MySQL") is a near-miss: still
 * reported in the same R-03 finding, flagged for human review.
 */
export function prescreenCandidate(
  input: { minYears: number; minDegree: keyof typeof DEGREE_RANK; requiredSkills: string[] },
  candidate: { yearsOfExperience: number; degree: keyof typeof DEGREE_RANK; skills: string[]; resumeText: string }
): PrescreenFinding[] {
  const findings: PrescreenFinding[] = []
  if (candidate.yearsOfExperience < input.minYears) {
    findings.push({
      rule: 'R-01',
      severity: 'error',
      message: `Years of experience ${candidate.yearsOfExperience} is below the JD minimum ${input.minYears}.`,
      evidence: excerpt(candidate.resumeText, String(candidate.yearsOfExperience))
    })
  }
  if (DEGREE_RANK[candidate.degree] < DEGREE_RANK[input.minDegree]) {
    findings.push({
      rule: 'R-02',
      severity: 'error',
      message: `Degree ${candidate.degree} is below the JD minimum ${input.minDegree}.`,
      evidence: excerpt(candidate.resumeText, candidate.degree)
    })
  }
  const candidateSkills = new Set(candidate.skills.map(normalizeSkill))
  const missing: string[] = []
  const nearMisses: Array<{ mentioned: string; required: string }> = []
  for (const skill of input.requiredSkills) {
    if (skillMatches(skill, candidateSkills)) continue
    missing.push(skill)
    const normalized = normalizeSkill(skill)
    const mentioned = candidate.skills.find((candidateSkill) => {
      const candidateNormalized = normalizeSkill(candidateSkill)
      return (
        candidateNormalized !== normalized &&
        (candidateNormalized.includes(normalized) || normalized.includes(candidateNormalized))
      )
    })
    if (mentioned) nearMisses.push({ mentioned, required: skill })
  }
  if (missing.length > 0) {
    let message = `Required skills not found: ${missing.join(', ')}.`
    if (nearMisses.length > 0) {
      const details = nearMisses
        .map(({ mentioned, required }) => `only related skill "${mentioned}" was mentioned, "${required}" was not written explicitly`)
        .join('; ')
      message += ` Near-miss: ${details}; please verify manually.`
    }
    findings.push({
      rule: 'R-03',
      severity: 'warning',
      message,
      evidence: excerpt(candidate.resumeText, missing[0])
    })
  }
  return findings
}

export function validateDimensions(dimensions: ScoreDimensionInput[]): { totalScore: number } {
  const seen = new Set<string>()
  if (dimensions.length !== SCORE_DIMENSIONS.length) {
    throw new BadRequestException(`Exactly ${SCORE_DIMENSIONS.length} score dimensions are required.`)
  }
  let totalScore = 0
  for (const dimension of dimensions) {
    const definition = SCORE_DIMENSIONS.find((item) => item.key === dimension.dimension)
    if (!definition) {
      throw new BadRequestException(`Unknown score dimension: ${dimension.dimension}.`)
    }
    if (seen.has(dimension.dimension)) {
      throw new BadRequestException(`Duplicate score dimension: ${dimension.dimension}.`)
    }
    seen.add(dimension.dimension)
    if (!Number.isInteger(dimension.score) || dimension.score < 0 || dimension.score > definition.max) {
      throw new BadRequestException(`Score for ${dimension.dimension} must be an integer between 0 and ${definition.max}.`)
    }
    if (!dimension.reason || dimension.reason.trim().length === 0 || dimension.reason.length > 300) {
      throw new BadRequestException(`Each score dimension needs a one-sentence reason (1-300 characters).`)
    }
    totalScore += dimension.score
  }
  return { totalScore }
}

@Injectable()
export class ResumeScreeningService {
  constructor(
    @InjectRepository(ResumeScreening)
    private readonly screenings: Repository<ResumeScreening>,
    @InjectRepository(ResumeCandidate)
    private readonly candidates: Repository<ResumeCandidate>,
    @InjectRepository(ResumeScore)
    private readonly scores: Repository<ResumeScore>,
    @Optional() @InjectRepository(ResumeScoringTask)
    private readonly tasks?: Repository<ResumeScoringTask>
  ) {}

  private screeningWhere(scope: ResumeScope, id: string) {
    return { ...this.scopeWhere(scope), id,
      ...(scope.workspaceId ? { workspaceId: scope.workspaceId } : {}),
      ...(scope.projectId ? { projectId: scope.projectId } : {}),
      ...(scope.assistantId && !scope.projectId ? { xpertId: scope.assistantId } : {}) }
  }

  private scopeWhere(scope: ResumeScope) {
    if (!scope.tenantId) throw new BadRequestException('Authenticated tenant context is required.')
    return { tenantId: scope.tenantId, organizationId: scope.organizationId ?? IsNull() }
  }

  async listScreenings(scope: ResumeScope, page = 1) {
    const { id: _id, ...where } = this.screeningWhere(scope, undefined)
    const items = await this.screenings.find({ where: where as never,
      order: { createdAt: 'DESC', id: 'ASC' }, take: 100, skip: (Math.max(1, page) - 1) * 100 })
    return items.map(({ id, title, jobTitle }) => ({ id: id as string, title, jobTitle }))
  }

  async getScreeningList(scope: ResumeScope, query: { search?: string; status?: string; page?: number; pageSize?: number } = {}) {
    const statuses: ResumeScreeningStatus[] = ['draft', 'prescreened', 'scored', 'reviewing', 'completed', 'failed']
    if (query.status && !statuses.includes(query.status as ResumeScreeningStatus)) {
      throw new BadRequestException('Invalid screening status filter.')
    }
    const { id: _id, ...where } = this.screeningWhere(scope, undefined)
    const builder = this.screenings.createQueryBuilder('screening').where(where)
    const search = query.search?.trim().toLowerCase()
    if (search) builder.andWhere('(LOWER(screening.title) LIKE :search OR LOWER(screening.jobTitle) LIKE :search)',
      { search: `%${search.replace(/[\\%_]/g, '\\$&')}%` })
    if (query.status) builder.andWhere('screening.status = :status', { status: query.status })
    const total = await builder.getCount()
    const pageSize = Number.isFinite(query.pageSize) ? Math.min(50, Math.max(1, Math.floor(query.pageSize))) : 20
    const page = Math.min(Number.isFinite(query.page) ? Math.max(1, Math.floor(query.page)) : 1,
      Math.max(1, Math.ceil(total / pageSize)))
    const records = await builder.orderBy('screening.createdAt', 'DESC').addOrderBy('screening.id', 'ASC')
      .offset((page - 1) * pageSize).limit(pageSize).getMany()
    const items: ScreeningListItem[] = await Promise.all(records.map(async (screening) => ({
      id: screening.id as string, title: screening.title, jobTitle: screening.jobTitle, status: screening.status ?? 'draft',
      candidateCount: await this.candidates.count({ where: { ...this.scopeWhere(scope), screeningId: screening.id } as never }),
      updatedAt: screening.updatedAt?.toISOString() ?? null
    })))
    const summary: ScreeningListSummary = { kind: 'screening_list', page, pageSize }
    return { items, total, summary }
  }

  async getScreeningDetail(scope: ResumeScope, screeningId: string) {
    const screening = await this.requireScreening(scope, screeningId)
    const candidateCount = await this.candidates.count({ where: { ...this.scopeWhere(scope), screeningId } as never })
    return { screeningId, title: screening.title, jobTitle: screening.jobTitle, status: screening.status ?? 'draft',
      candidateCount, edit: { ...screeningEditFields(screening), version: screeningEditVersion(screening),
        criteriaLocked: screening.criteriaLocked === true || candidateCount > 0 } }
  }

  /** Explicit item read: the model receives saved evidence, never invented input. */
  async getCandidateContext(scope: ResumeScope, screeningId: string, candidateId: string) {
    const screening = await this.requireScreening(scope, screeningId)
    const candidate = await this.requireCandidate(scope, screeningId, candidateId)
    const evidence = candidateEvidence(screening, candidate)
    return { screeningId, candidateId, evidenceVersion: evidence.version, candidateRevision: evidence.candidateRevision,
      jobTitle: screening.jobTitle, jdText: screening.jdText,
      minYears: screening.minYears, minDegree: screening.minDegree, requiredSkills: screening.requiredSkills,
      name: candidate.name, resumeText: candidate.resumeText, yearsOfExperience: candidate.yearsOfExperience,
      degree: candidate.degree, skills: candidate.skills, prescreen: candidate.prescreenFindings ?? [] }
  }

  private async refreshStatus(scope: ResumeScope, screeningId: string) {
    const where = { ...this.scopeWhere(scope), screeningId }
    const count = await this.candidates.count({ where: where as never })
    const scoreCount = await this.candidateQuery(scope, screeningId)
      .andWhere('score.candidateRevision = candidate.revision').getCount()
    const confirmed = await this.candidateQuery(scope, screeningId)
      .andWhere('score.candidateRevision = candidate.revision').andWhere('score.decision IS NOT NULL').getCount()
    const screening = await this.requireScreening(scope, screeningId)
    const status = count > 0 && confirmed === count ? 'completed'
      : confirmed > 0 ? 'reviewing' : count > 0 && scoreCount === count ? 'scored'
      : scoreCount > 0 || screening.status === 'prescreened' ? 'prescreened' : 'draft'
    await this.screenings.update(this.screeningWhere(scope, screeningId) as never, { candidateCount: count, status })
  }

  private candidateQuery(scope: ResumeScope, screeningId: string) {
    return this.candidates.createQueryBuilder('candidate')
      .leftJoin(ResumeScore, 'score', 'score.candidateId = CAST(candidate.id AS varchar) AND score.screeningId = candidate.screeningId AND score.tenantId = candidate.tenantId AND (score.organizationId = candidate.organizationId OR (score.organizationId IS NULL AND candidate.organizationId IS NULL))')
      .where({ ...this.scopeWhere(scope), screeningId })
  }

  private async requireScreening(scope: ResumeScope, screeningId: string): Promise<ResumeScreening> {
    if (!screeningId) throw new BadRequestException('Screening id is required.')
    const screening = await this.screenings.findOne({ where: this.screeningWhere(scope, screeningId) as never })
    if (!screening) {
      throw new NotFoundException(`Screening ${screeningId} was not found in the current tenant or organization.`)
    }
    return screening
  }

  private async requireCandidate(scope: ResumeScope, screeningId: string, candidateId: string): Promise<ResumeCandidate> {
    if (!screeningId || !candidateId) throw new BadRequestException('Screening and candidate ids are required.')
    const candidate = await this.candidates.findOne({
      where: { ...this.scopeWhere(scope), id: candidateId, screeningId } as never
    })
    if (!candidate) {
      throw new NotFoundException(`Candidate ${candidateId} was not found in screening ${screeningId}.`)
    }
    return candidate
  }

  async createScreening(scope: ResumeScope, input: CreateScreeningInput): Promise<ResumeScreening> {
    this.scopeWhere(scope)
    validateRequestId(input.requestId)
    if (input.requestId) {
      const existing = await this.screenings.findOne({ where: this.screeningWhere(scope, input.requestId) as never })
      if (existing) return existing
    }
    const fields = screeningEditFields(input)
    const screening = this.screenings.create({
      ...(input.requestId ? { id: input.requestId } : {}),
      tenantId: scope.tenantId,
      organizationId: scope.organizationId ?? undefined,
      workspaceId: scope.workspaceId ?? undefined,
      projectId: scope.projectId ?? undefined,
      createdById: scope.userId ?? undefined,
      xpertId: scope.assistantId ?? input.xpertId,
      agentKey: input.agentKey,
      ...fields,
      status: 'draft',
      candidateCount: 0,
      criteriaLocked: false,
      editRevision: 1
    })
    if (input.requestId) {
      // A caller-selected UUID must only INSERT. Repository.save could update
      // a same-UUID row belonging to a different scope before authorization.
      try { await this.screenings.insert(screening) } catch {
        const existing = await this.screenings.findOne({ where: this.screeningWhere(scope, input.requestId) as never })
        if (existing) return existing
        throw new ConflictException('Screening could not be created. Retry with the same request ID.')
      }
      return this.requireScreening(scope, input.requestId)
    }
    return this.screenings.save(screening)
  }

  async updateScreening(scope: ResumeScope, input: UpdateScreeningInput): Promise<ResumeScreening> {
    const fields = screeningEditFields(input)
    if (!/^[a-f0-9]{64}$/.test(input.baseVersion ?? '')) {
      throw new BadRequestException('A valid screening edit version is required.')
    }
    const screening = await this.requireScreening(scope, input.screeningId)
    if (input.baseVersion !== screeningEditVersion(screening)) {
      throw new ResumeRevisionConflictError('Screening changed. Reload before editing again.')
    }
    const count = await this.candidates.count({
      where: { ...this.scopeWhere(scope), screeningId: input.screeningId } as never
    })
    if ((screening.criteriaLocked || count > 0) && !sameScreeningCriteria(screeningEditFields(screening), fields)) {
      throw new ResumeCriteriaLockedError('Scoring criteria are locked after adding a candidate. Create a new screening for new criteria.')
    }
    const updated = await this.screenings.update({ ...this.screeningWhere(scope, input.screeningId),
      editRevision: screening.editRevision ?? 1, criteriaLocked: screening.criteriaLocked ?? false } as never,
    { ...fields, editRevision: (screening.editRevision ?? 1) + 1 })
    if (!updated.affected) throw new ResumeRevisionConflictError('Screening changed. Reload before editing again.')
    return this.requireScreening(scope, input.screeningId)
  }

  async addCandidate(scope: ResumeScope, input: AddCandidateInput): Promise<ResumeCandidate> {
    const screening = await this.requireScreening(scope, input.screeningId)
    validateRequestId(input.requestId)
    if (input.requestId) {
      const existing = await this.candidates.findOne({ where: {
        ...this.scopeWhere(scope), id: input.requestId, screeningId: input.screeningId
      } as never })
      if (existing) {
        await this.refreshStatus(scope, input.screeningId)
        return existing
      }
    }
    if (!input.name?.trim()) {
      throw new BadRequestException('Candidate name is required.')
    }
    if (!(input.degree in DEGREE_RANK) || !Array.isArray(input.skills) || input.skills.length > 50
      || input.skills.some((skill) => typeof skill !== 'string' || !skill.trim() || skill.length > 100) || input.name.length > 200) {
      throw new BadRequestException('Invalid candidate degree, name, or skills.')
    }
    if (!input.resumeText?.trim() || input.resumeText.length > MAX_RESUME_TEXT_LENGTH) {
      throw new BadRequestException(`Resume text is required and must be at most ${MAX_RESUME_TEXT_LENGTH} characters.`)
    }
    if (!Number.isInteger(input.yearsOfExperience) || input.yearsOfExperience < 0 || input.yearsOfExperience > 60) {
      throw new BadRequestException('yearsOfExperience must be an integer between 0 and 60.')
    }
    // Seal with one conditional write before insertion. A failed insertion keeps
    // the seal, so no concurrent candidate can ever observe changed criteria.
    if (!screening.criteriaLocked) {
      const sealed = await this.screenings.update({ ...this.screeningWhere(scope, input.screeningId),
        criteriaLocked: false, editRevision: screening.editRevision ?? 1 } as never,
      { criteriaLocked: true, editRevision: (screening.editRevision ?? 1) + 1 })
      if (!sealed.affected) {
        const current = await this.requireScreening(scope, input.screeningId)
        if (!current.criteriaLocked) throw new ResumeRevisionConflictError('Criteria changed. Reload before adding the candidate.')
      }
    }
    const candidate = this.candidates.create({
      ...(input.requestId ? { id: input.requestId } : {}),
      tenantId: scope.tenantId,
      organizationId: scope.organizationId ?? undefined,
      screeningId: screening.id as string,
      name: input.name.trim(),
      yearsOfExperience: input.yearsOfExperience,
      degree: input.degree,
      skills: uniqueSkills(input.skills),
      resumeText: input.resumeText.trim(),
      prescreenFindings: [],
      revision: 1
    })
    let saved: ResumeCandidate
    if (input.requestId) {
      try { await this.candidates.insert(candidate) } catch {
        const existing = await this.candidates.findOne({ where: {
          ...this.scopeWhere(scope), id: input.requestId, screeningId: input.screeningId
        } as never })
        if (!existing) throw new ConflictException('Candidate could not be added. Retry with the same request ID.')
      }
      saved = await this.requireCandidate(scope, input.screeningId, input.requestId)
    } else saved = await this.candidates.save(candidate)
    await this.refreshStatus(scope, screening.id as string)
    return saved
  }

  async getCandidateDetail(scope: ResumeScope, screeningId: string, candidateId: string): Promise<CandidateDetail> {
    const screening = await this.requireScreening(scope, screeningId)
    const candidate = await this.requireCandidate(scope, screeningId, candidateId)
    const score = await this.scores.findOne({ where: { ...this.scopeWhere(scope), screeningId, candidateId } as never })
    const state = scoreState(score, candidateEvidence(screening, candidate))
    return { ...candidateFields(candidate), candidateId, screeningId, revision: candidate.revision ?? 1,
      scoreState: state, evidence: score?.evidence,
      history: score && state === 'stale' ? [...(score.history ?? []), scoreHistoryEntry(score)] : score?.history ?? [] }
  }

  async updateCandidate(scope: ResumeScope, input: CandidateFields & {
    screeningId: string; candidateId: string; baseRevision: number
  }): Promise<CandidateDetail> {
    await this.requireScreening(scope, input.screeningId)
    const current = await this.requireCandidate(scope, input.screeningId, input.candidateId)
    const fields = candidateFields(input)
    if (!Number.isInteger(input.baseRevision) || input.baseRevision !== (current.revision ?? 1)) {
      throw new ResumeRevisionConflictError('Resume changed. Reload before editing again.')
    }
    if (JSON.stringify(candidateFields(current)) === JSON.stringify(fields)) {
      return this.getCandidateDetail(scope, input.screeningId, input.candidateId)
    }
    const changed = await this.candidates.update({ ...this.scopeWhere(scope), screeningId: input.screeningId,
      id: input.candidateId, revision: input.baseRevision } as never,
    { ...fields, revision: input.baseRevision + 1, prescreenFindings: [] })
    if (!changed.affected) throw new ResumeRevisionConflictError('Resume changed. Reload before editing again.')
    await this.refreshStatus(scope, input.screeningId)
    return this.getCandidateDetail(scope, input.screeningId, input.candidateId)
  }

  async prepareScoring(scope: ResumeScope, input: {
    screeningId: string; candidateIds: string[]; requestId: string; replaceReviewed?: boolean
  }) {
    validateRequestId(input.requestId)
    if (!input.requestId || !Array.isArray(input.candidateIds) || input.candidateIds.length < 1
      || input.candidateIds.length > 20 || new Set(input.candidateIds).size !== input.candidateIds.length) {
      throw new BadRequestException('Select 1-20 different candidates.')
    }
    const screening = await this.requireScreening(scope, input.screeningId)
    if (!this.tasks) throw new BadRequestException('Scoring task persistence is unavailable.')
    const previous = await this.tasks.findOne({ where: { ...this.scopeWhere(scope), id: input.requestId,
      screeningId: input.screeningId } as never })
    if (previous) {
      if (JSON.stringify(previous.items.map((item) => item.candidateId)) !== JSON.stringify(input.candidateIds)) {
        throw new ConflictException('A request ID cannot be reused for another selection.')
      }
      return { taskId: previous.id as string, candidateIds: input.candidateIds }
    }
    const items = []
    for (const candidateId of input.candidateIds) {
      const candidate = await this.requireCandidate(scope, input.screeningId, candidateId)
      const score = await this.scores.findOne({ where: { ...this.scopeWhere(scope),
        screeningId: input.screeningId, candidateId } as never })
      const evidence = candidateEvidence(screening, candidate)
      if (score?.decision && scoreState(score, evidence) !== 'stale' && !input.replaceReviewed) {
        throw new ConflictException('Selection includes reviewed candidates. Explicitly confirm re-evaluation first.')
      }
      items.push({ candidateId, evidence, scoreRevision: score?.revision ?? 0 })
    }
    const task = this.tasks.create({ id: input.requestId, tenantId: scope.tenantId,
      organizationId: scope.organizationId ?? undefined, screeningId: input.screeningId,
      items, replaceReviewed: input.replaceReviewed === true })
    try { await this.tasks.insert(task) } catch {
      throw new ResumeRevisionConflictError('Scoring request changed. Retry after refreshing.')
    }
    return { taskId: task.id as string, candidateIds: input.candidateIds }
  }

  async getScoringTarget(scope: ResumeScope, screeningId: string, taskId: string, candidateId: string) {
    await this.requireScreening(scope, screeningId)
    if (!this.tasks) throw new BadRequestException('Scoring task persistence is unavailable.')
    const task = await this.tasks.findOne({ where: { ...this.scopeWhere(scope), id: taskId, screeningId } as never })
    const target = task?.items.find((item) => item.candidateId === candidateId)
    if (!task || !target) throw new NotFoundException('Candidate is not in this authorized scoring selection.')
    const candidate = await this.requireCandidate(scope, screeningId, candidateId)
    if ((candidate.revision ?? 1) !== target.evidence.candidateRevision) {
      throw new ResumeRevisionConflictError('Resume changed after selection. Start a new scoring request.')
    }
    return { task, target }
  }

  async saveSelectedScore(scope: ResumeScope, input: {
    screeningId: string; taskId: string; candidateId: string; dimensions: ScoreDimensionInput[]
  }) {
    const { task, target } = await this.getScoringTarget(scope, input.screeningId, input.taskId, input.candidateId)
    return this.saveScore(scope, { ...input, operationId: input.taskId,
      expectedEvidence: target.evidence.version, expectedScoreRevision: target.scoreRevision,
      replaceReviewed: task.replaceReviewed })
  }

  /** Deterministic prescreen. Persists findings on the candidate and returns them. */
  async prescreenResume(scope: ResumeScope, screeningId: string, candidateId: string): Promise<PrescreenFinding[]> {
    const screening = await this.requireScreening(scope, screeningId)
    const candidate = await this.requireCandidate(scope, screeningId, candidateId)
    const findings = prescreenCandidate(
      { minYears: screening.minYears, minDegree: screening.minDegree, requiredSkills: screening.requiredSkills },
      {
        yearsOfExperience: candidate.yearsOfExperience,
        degree: candidate.degree,
        skills: candidate.skills,
        resumeText: candidate.resumeText
      }
    )
    const updated = await this.candidates.update({ ...this.scopeWhere(scope), screeningId,
      id: candidateId, revision: candidate.revision ?? 1 } as never, { prescreenFindings: findings })
    if (!updated.affected) throw new ResumeRevisionConflictError('Resume changed during prescreen. Start a new scoring request.')
    if (screening.status === 'draft') {
      await this.screenings.update({ ...this.screeningWhere(scope, screeningId), status: 'draft' } as never,
        { status: 'prescreened' })
    }
    return findings
  }

  /**
   * Save an AI-produced score. The model supplies judgments only; the service
   * validates ranges, computes the total, and enforces idempotency:
   * the same operationId returns the stored receipt, and a second save for the
   * same (screeningId, candidateId) updates the existing row instead of
   * creating a duplicate. Tools additionally require a persisted human-selected
   * scoring task. No plugin-managed transaction is opened.
   */
  async saveScore(
    scope: ResumeScope,
    input: { screeningId: string; candidateId: string; operationId?: string; dimensions: ScoreDimensionInput[];
      expectedEvidence?: string; expectedScoreRevision?: number; replaceReviewed?: boolean }
  ): Promise<ScoreReceipt> {
    const screening = await this.requireScreening(scope, input.screeningId)
    const candidate = await this.requireCandidate(scope, input.screeningId, input.candidateId)
    const evidence = candidateEvidence(screening, candidate)
    if (input.expectedEvidence && input.expectedEvidence !== evidence.version) {
      throw new ResumeRevisionConflictError('Resume changed. Start a new scoring request.')
    }
    const operationId = input.operationId ? createHash('sha256').update(JSON.stringify([
      scope.tenantId, scope.organizationId ?? null, input.screeningId, input.candidateId, input.operationId
    ])).digest('hex') : undefined
    if (operationId) {
      const existingByOperation = await this.scores.findOne({ where: { ...this.scopeWhere(scope), operationId } as never })
      if (existingByOperation) {
        await this.refreshStatus(scope, input.screeningId)
        return toReceipt(existingByOperation, true, 'Score was already saved for this operation.')
      }
    }
    const { totalScore } = validateDimensions(input.dimensions)
    const existing = await this.scores.findOne({
      where: { ...this.scopeWhere(scope), screeningId: input.screeningId, candidateId: input.candidateId } as never
    })
    if (input.expectedScoreRevision !== undefined && input.expectedScoreRevision !== (existing?.revision ?? 0)) {
      throw new ResumeRevisionConflictError('Score or human review changed after selection. Refresh and select again.')
    }
    if (existing) {
      if (JSON.stringify(existing.dimensions) === JSON.stringify(input.dimensions)
        && (!existing.evidence || existing.evidence.version === evidence.version) && !input.replaceReviewed
        && scoreState(existing, evidence) !== 'stale') {
        await this.refreshStatus(scope, input.screeningId)
        return toReceipt(existing, true, 'The same score is already saved.')
      }
      if (existing.decision && scoreState(existing, evidence) !== 'stale' && !input.replaceReviewed) {
        throw new ConflictException('A human has confirmed this candidate. The confirmed score cannot be replaced by AI.')
      }
      const revision = existing.revision ?? 1
      const history = [...(existing.history ?? []), scoreHistoryEntry(existing)]
      existing.dimensions = input.dimensions
      existing.totalScore = totalScore
      existing.adjustedTotal = null
      existing.operationId = operationId ?? existing.operationId
      existing.revision = (existing.revision ?? 1) + 1
      existing.scoredAt = new Date()
      const updated = await this.scores.update({ ...this.scopeWhere(scope), id: existing.id, revision } as never,
        { dimensions: existing.dimensions, totalScore, adjustedTotal: null, operationId: existing.operationId,
          revision: existing.revision, scoredAt: existing.scoredAt, evidence, history, decision: null, note: null, decidedById: null,
          candidateRevision: candidate.revision ?? 1, evidenceVersion: evidence.version })
      if (!updated.affected) throw new ResumeRevisionConflictError('Reload before scoring again.')
      await this.refreshStatus(scope, input.screeningId)
      return toReceipt(existing, true, 'Score was updated for the same candidate; no duplicate record was created.')
    }
    const created = this.scores.create({
      tenantId: scope.tenantId,
      organizationId: scope.organizationId ?? undefined,
      screeningId: input.screeningId,
      candidateId: input.candidateId,
      operationId,
      dimensions: input.dimensions,
      totalScore,
      scoredAt: new Date(),
      adjustedTotal: null,
      decision: null,
      note: null,
      revision: 1,
      evidence, history: [], candidateRevision: candidate.revision ?? 1, evidenceVersion: evidence.version
    })
    let saved: ResumeScore
    try {
      saved = await this.scores.save(created)
    } catch (error) {
      // Concurrent first writes are arbitrated by the database unique constraint.
      // A retry of the winning operation returns its receipt; another operation
      // receives a conflict instead of silently overwriting the winner.
      const winner = await this.scores.findOne({ where: {
        ...this.scopeWhere(scope), screeningId: input.screeningId, candidateId: input.candidateId
      } as never })
      if (!winner) throw error
      if ((operationId && winner.operationId === operationId) || (winner.evidenceVersion === evidence.version
        && JSON.stringify(winner.dimensions) === JSON.stringify(input.dimensions))) {
        await this.refreshStatus(scope, input.screeningId)
        return toReceipt(winner, true, 'Score was already saved. No duplicate was created.')
      }
      throw new ResumeRevisionConflictError('Another score was saved. Reload before retrying.')
    }
    await this.refreshStatus(scope, input.screeningId)
    return toReceipt(saved, false, 'Score was saved.')
  }

  /** Human confirmation. Enforces the decision enum and compare-and-swap on revision. */
  async confirmScreening(scope: ResumeScope, input: ConfirmScreeningInput): Promise<ScoreReceipt> {
    if (!DECISIONS.includes(input.decision)) {
      throw new BadRequestException(`Decision must be one of: ${DECISIONS.join(', ')}.`)
    }
    if (input.adjustedTotal !== undefined && input.adjustedTotal !== null
      && (!Number.isInteger(input.adjustedTotal) || input.adjustedTotal < 0 || input.adjustedTotal > 100)) {
      throw new BadRequestException('adjustedTotal must be an integer between 0 and 100.')
    }
    if (input.note !== undefined && input.note.length > MAX_NOTE_LENGTH) {
      throw new BadRequestException(`Note must be at most ${MAX_NOTE_LENGTH} characters.`)
    }
    const screening = await this.requireScreening(scope, input.screeningId)
    const candidate = await this.requireCandidate(scope, input.screeningId, input.candidateId)
    const score = await this.scores.findOne({
      where: { ...this.scopeWhere(scope), screeningId: input.screeningId, candidateId: input.candidateId } as never
    })
    if (!score) {
      throw new NotFoundException(`No score exists for candidate ${input.candidateId} yet. Score the candidate before confirming.`)
    }
    if (scoreState(score, candidateEvidence(screening, candidate)) === 'stale') {
      throw new ResumeRevisionConflictError('Resume changed. Re-score before confirming.')
    }
    if (input.baseRevision !== undefined && input.baseRevision !== score.revision) {
      throw new ResumeRevisionConflictError(
        `Score was changed by someone else (current revision ${score.revision}). Reload and confirm again.`
      )
    }
    if (!Number.isInteger(input.baseRevision) || input.baseRevision < 1) {
      throw new BadRequestException('baseRevision is required. Reload before confirming.')
    }
    const revision = score.revision ?? 1
    score.decision = input.decision
    if (input.adjustedTotal !== undefined) {
      score.adjustedTotal = input.adjustedTotal
    }
    if (input.note !== undefined) {
      score.note = input.note
    }
    score.decidedById = scope.userId ?? score.decidedById
    score.revision = (score.revision ?? 1) + 1
    const updated = await this.scores.update({ ...this.scopeWhere(scope), id: score.id, revision } as never,
      { decision: score.decision, adjustedTotal: score.adjustedTotal, note: score.note,
        decidedById: score.decidedById, revision: score.revision })
    if (!updated.affected) throw new ResumeRevisionConflictError('Reload before confirming again.')
    await this.refreshStatus(scope, input.screeningId)
    return toReceipt(score, false, 'Confirmation was saved.')
  }

  /** Paged Workbench read, sorted by total score descending. Scope is applied before paging. */
  async getWorkbenchData(scope: ResumeScope, query: ResumeWorkbenchQuery = {}): Promise<ResumeWorkbenchData> {
    const page = Number.isFinite(query.page) ? Math.max(1, Math.floor(query.page)) : 1
    const pageSize = Number.isFinite(query.pageSize) ? Math.min(100, Math.max(1, Math.floor(query.pageSize))) : 20
    const screenings = await this.listScreenings(scope)
    const screeningId = query.screeningId ?? screenings[0]?.id
    if (!screeningId) {
      return {
        items: [],
        total: 0,
        summary: { screeningId: null, title: null, jobTitle: null, status: null, page, pageSize, screenings }
      }
    }
    const screening = await this.requireScreening(scope, screeningId)
    const candidateQuery = this.candidateQuery(scope, screening.id as string)
    const search = query.search?.trim().toLowerCase() ?? ''
    if (search) candidateQuery.andWhere('LOWER(candidate.name) LIKE :search', { search: `%${search.replace(/[\\%_]/g, '\\$&')}%` })
    const total = await candidateQuery.getCount()
    const currentPage = Math.min(page, Math.max(1, Math.ceil(total / pageSize)))
    const candidates = await candidateQuery
      .addSelect('CASE WHEN score.candidateRevision = candidate.revision THEN COALESCE(score.adjustedTotal, score.totalScore, -1) ELSE -1 END', 'effective_score')
      .orderBy('effective_score', 'DESC').addOrderBy('candidate.createdAt', 'ASC').addOrderBy('candidate.id', 'ASC')
      .offset((currentPage - 1) * pageSize).limit(pageSize).getMany()
    const scores = candidates.length ? await this.scores.find({
      where: { ...this.scopeWhere(scope), screeningId: screening.id, candidateId: In(candidates.map((item) => item.id)) } as never,
      select: ['id', 'candidateId', 'dimensions', 'totalScore', 'adjustedTotal', 'decision', 'note', 'revision',
        'candidateRevision', 'evidenceVersion']
    }) : []
    const scoreByCandidate = new Map(scores.map((score) => [score.candidateId as string, score]))
    const rows: CandidateRow[] = candidates
      .map((candidate) => {
        const score = scoreByCandidate.get(candidate.id as string)
        const prescreen = candidate.prescreenFindings ?? []
        const state = scoreState(score, candidateEvidence(screening, candidate))
        const totalScore = score && state !== 'stale' ? (score.adjustedTotal ?? score.totalScore) : null
        return {
          candidateId: candidate.id as string,
          name: candidate.name,
          yearsOfExperience: candidate.yearsOfExperience,
          degree: candidate.degree,
          skills: candidate.skills,
          prescreen,
          totalScore,
          adjustedTotal: state === 'stale' ? null : score?.adjustedTotal ?? null,
          decision: state === 'stale' ? null : score?.decision ?? null,
          suggestedDecision: suggestDecision(state === 'stale' ? null : score?.totalScore ?? null, prescreen.some((finding) => finding.severity === 'error')),
          note: score?.note ?? null,
          revision: score?.revision ?? 0,
          dimensions: score?.dimensions ?? [],
          aiTotalScore: score?.totalScore ?? null,
          scoreState: state, candidateRevision: candidate.revision ?? 1
        }
      })
      .sort((a, b) => (b.totalScore ?? -1) - (a.totalScore ?? -1))
    return {
      items: rows,
      total,
      summary: {
        screeningId: screening.id as string,
        title: screening.title,
        jobTitle: screening.jobTitle,
        status: screening.status ?? 'draft',
        page: currentPage,
        pageSize,
        jdText: screening.jdText,
        edit: { ...screeningEditFields(screening), version: screeningEditVersion(screening),
          criteriaLocked: screening.criteriaLocked === true || (await this.candidates.count({ where: {
            ...this.scopeWhere(scope), screeningId: screening.id
          } as never })) > 0 },
        screenings
      }
    }
  }
}

function toReceipt(score: ResumeScore, duplicate: boolean, message: string): ScoreReceipt {
  return {
    screeningId: score.screeningId,
    candidateId: score.candidateId,
    scoreId: score.id as string,
    totalScore: score.adjustedTotal ?? score.totalScore,
    revision: score.revision ?? 1,
    duplicate,
    status: 'saved',
    message
  }
}
