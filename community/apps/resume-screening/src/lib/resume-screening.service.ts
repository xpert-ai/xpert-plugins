import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Repository } from 'typeorm'
import { ResumeCandidate } from './entities/resume-candidate.entity.js'
import { ResumeScore } from './entities/resume-score.entity.js'
import { ResumeScreening } from './entities/resume-screening.entity.js'
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
  ScoreReceipt
} from './types.js'

const MAX_EVIDENCE_LENGTH = 200
const MAX_RESUME_TEXT_LENGTH = 20000
const MAX_NOTE_LENGTH = 500
const DECISIONS: ResumeDecision[] = ['interview', 'pending', 'rejected']

function excerpt(text: string, needle: string, length = MAX_EVIDENCE_LENGTH): string {
  const index = needle ? text.toLowerCase().indexOf(needle.toLowerCase()) : -1
  const start = index >= 0 ? Math.max(0, index - 20) : 0
  const slice = text.slice(start, start + length)
  return slice.length < text.length ? `${slice}…` : slice
}

function normalizeSkill(skill: string): string {
  return skill.trim().toLowerCase()
}

/**
 * Deterministic prescreen rules. No model call happens here.
 * R-01: years of experience below the JD minimum.
 * R-02: degree level below the JD minimum.
 * R-03: each required skill missing from the resume (one warning per skill).
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
  for (const skill of input.requiredSkills) {
    if (!candidateSkills.has(normalizeSkill(skill))) {
      findings.push({
        rule: 'R-03',
        severity: 'warning',
        message: `Required skill "${skill}" is not found in the resume.`,
        evidence: excerpt(candidate.resumeText, skill)
      })
    }
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
    private readonly scores: Repository<ResumeScore>
  ) {}

  private screeningWhere(scope: ResumeScope, id: string) {
    return { id, tenantId: scope.tenantId, organizationId: scope.organizationId ?? undefined } as Record<string, unknown>
  }

  private async requireScreening(scope: ResumeScope, screeningId: string): Promise<ResumeScreening> {
    const screening = await this.screenings.findOne({ where: this.screeningWhere(scope, screeningId) as never })
    if (!screening) {
      throw new NotFoundException(`Screening ${screeningId} was not found in the current tenant or organization.`)
    }
    return screening
  }

  private async requireCandidate(scope: ResumeScope, screeningId: string, candidateId: string): Promise<ResumeCandidate> {
    const candidate = await this.candidates.findOne({
      where: { id: candidateId, screeningId, tenantId: scope.tenantId } as never
    })
    if (!candidate) {
      throw new NotFoundException(`Candidate ${candidateId} was not found in screening ${screeningId}.`)
    }
    return candidate
  }

  async createScreening(scope: ResumeScope, input: CreateScreeningInput): Promise<ResumeScreening> {
    if (!input.title?.trim() || !input.jobTitle?.trim() || !input.jdText?.trim()) {
      throw new BadRequestException('Title, job title and JD text are required.')
    }
    if (!Number.isInteger(input.minYears) || input.minYears < 0 || input.minYears > 50) {
      throw new BadRequestException('minYears must be an integer between 0 and 50.')
    }
    if (!input.requiredSkills || input.requiredSkills.length === 0 || input.requiredSkills.length > 20) {
      throw new BadRequestException('Provide 1-20 required skills.')
    }
    const screening = this.screenings.create({
      tenantId: scope.tenantId,
      organizationId: scope.organizationId ?? undefined,
      workspaceId: scope.workspaceId ?? undefined,
      projectId: scope.projectId ?? undefined,
      createdById: scope.userId ?? undefined,
      xpertId: input.xpertId,
      agentKey: input.agentKey,
      title: input.title.trim(),
      jobTitle: input.jobTitle.trim(),
      jdText: input.jdText.trim(),
      minYears: input.minYears,
      minDegree: input.minDegree,
      requiredSkills: input.requiredSkills.map((skill) => skill.trim()).filter(Boolean),
      status: 'draft',
      candidateCount: 0
    })
    return this.screenings.save(screening)
  }

  async addCandidate(scope: ResumeScope, input: AddCandidateInput): Promise<ResumeCandidate> {
    const screening = await this.requireScreening(scope, input.screeningId)
    if (!input.name?.trim()) {
      throw new BadRequestException('Candidate name is required.')
    }
    if (!input.resumeText?.trim() || input.resumeText.length > MAX_RESUME_TEXT_LENGTH) {
      throw new BadRequestException(`Resume text is required and must be at most ${MAX_RESUME_TEXT_LENGTH} characters.`)
    }
    if (!Number.isInteger(input.yearsOfExperience) || input.yearsOfExperience < 0 || input.yearsOfExperience > 60) {
      throw new BadRequestException('yearsOfExperience must be an integer between 0 and 60.')
    }
    const candidate = this.candidates.create({
      tenantId: scope.tenantId,
      organizationId: scope.organizationId ?? undefined,
      screeningId: screening.id as string,
      name: input.name.trim(),
      yearsOfExperience: input.yearsOfExperience,
      degree: input.degree,
      skills: input.skills.map((skill) => skill.trim()).filter(Boolean),
      resumeText: input.resumeText.trim(),
      prescreenFindings: []
    })
    const saved = await this.candidates.save(candidate)
    screening.candidateCount = (screening.candidateCount ?? 0) + 1
    await this.screenings.save(screening)
    return saved
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
    candidate.prescreenFindings = findings
    await this.candidates.save(candidate)
    if (screening.status === 'draft') {
      screening.status = 'prescreened'
      await this.screenings.save(screening)
    }
    return findings
  }

  /**
   * Save an AI-produced score. The model supplies judgments only; the service
   * validates ranges, computes the total, and enforces idempotency:
   * the same operationId returns the stored receipt, and a second save for the
   * same (screeningId, candidateId) updates the existing row instead of
   * creating a duplicate. No transaction is opened and no external call is
   * made inside this write.
   */
  async saveScore(
    scope: ResumeScope,
    input: { screeningId: string; candidateId: string; operationId?: string; dimensions: ScoreDimensionInput[] }
  ): Promise<ScoreReceipt> {
    await this.requireScreening(scope, input.screeningId)
    await this.requireCandidate(scope, input.screeningId, input.candidateId)
    if (input.operationId) {
      const existingByOperation = await this.scores.findOne({ where: { operationId: input.operationId } as never })
      if (existingByOperation) {
        return toReceipt(existingByOperation, true, 'Score was already saved for this operation.')
      }
    }
    const { totalScore } = validateDimensions(input.dimensions)
    const existing = await this.scores.findOne({
      where: { screeningId: input.screeningId, candidateId: input.candidateId } as never
    })
    if (existing) {
      existing.dimensions = input.dimensions
      existing.totalScore = totalScore
      existing.adjustedTotal = null
      existing.operationId = input.operationId ?? existing.operationId
      existing.revision = (existing.revision ?? 1) + 1
      const saved = await this.scores.save(existing)
      return toReceipt(saved, true, 'Score was updated for the same candidate; no duplicate record was created.')
    }
    const created = this.scores.create({
      tenantId: scope.tenantId,
      organizationId: scope.organizationId ?? undefined,
      screeningId: input.screeningId,
      candidateId: input.candidateId,
      operationId: input.operationId,
      dimensions: input.dimensions,
      totalScore,
      adjustedTotal: null,
      decision: null,
      note: null,
      revision: 1
    })
    const saved = await this.scores.save(created)
    return toReceipt(saved, false, 'Score was saved.')
  }

  /** Human confirmation. Enforces the decision enum and compare-and-swap on revision. */
  async confirmScreening(scope: ResumeScope, input: ConfirmScreeningInput): Promise<ScoreReceipt> {
    if (!DECISIONS.includes(input.decision)) {
      throw new BadRequestException(`Decision must be one of: ${DECISIONS.join(', ')}.`)
    }
    if (input.adjustedTotal !== undefined && (!Number.isInteger(input.adjustedTotal) || input.adjustedTotal < 0 || input.adjustedTotal > 100)) {
      throw new BadRequestException('adjustedTotal must be an integer between 0 and 100.')
    }
    if (input.note !== undefined && input.note.length > MAX_NOTE_LENGTH) {
      throw new BadRequestException(`Note must be at most ${MAX_NOTE_LENGTH} characters.`)
    }
    await this.requireScreening(scope, input.screeningId)
    await this.requireCandidate(scope, input.screeningId, input.candidateId)
    const score = await this.scores.findOne({
      where: { screeningId: input.screeningId, candidateId: input.candidateId } as never
    })
    if (!score) {
      throw new NotFoundException(`No score exists for candidate ${input.candidateId} yet. Score the candidate before confirming.`)
    }
    if (input.baseRevision !== undefined && input.baseRevision !== score.revision) {
      const error = new BadRequestException(
        `Score was changed by someone else (current revision ${score.revision}). Reload and confirm again.`
      )
      // Stable machine-readable code for the Workbench to branch on.
      ;(error as unknown as { errorCode: string }).errorCode = 'revision_conflict'
      throw error
    }
    score.decision = input.decision
    if (input.adjustedTotal !== undefined) {
      score.adjustedTotal = input.adjustedTotal
    }
    if (input.note !== undefined) {
      score.note = input.note
    }
    score.decidedById = scope.userId ?? score.decidedById
    score.revision = (score.revision ?? 1) + 1
    const saved = await this.scores.save(score)
    return toReceipt(saved, false, 'Confirmation was saved.')
  }

  /** Paged Workbench read, sorted by total score descending. Scope is applied before paging. */
  async getWorkbenchData(scope: ResumeScope, query: ResumeWorkbenchQuery = {}): Promise<ResumeWorkbenchData> {
    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20))
    if (!query.screeningId) {
      return {
        items: [],
        total: 0,
        summary: { screeningId: null, title: null, jobTitle: null, status: null, page, pageSize }
      }
    }
    const screening = await this.requireScreening(scope, query.screeningId)
    const candidates = await this.candidates.find({
      where: { screeningId: screening.id, tenantId: scope.tenantId } as never,
      order: { createdAt: 'ASC' } as never,
      take: pageSize,
      skip: (page - 1) * pageSize
    })
    const total = await this.candidates.count({
      where: { screeningId: screening.id, tenantId: scope.tenantId } as never
    })
    const scores = await this.scores.find({
      where: { screeningId: screening.id, tenantId: scope.tenantId } as never
    })
    const scoreByCandidate = new Map(scores.map((score) => [score.candidateId as string, score]))
    const search = query.search?.trim().toLowerCase() ?? ''
    const rows: CandidateRow[] = candidates
      .filter((candidate) => !search || candidate.name.toLowerCase().includes(search))
      .map((candidate) => {
        const score = scoreByCandidate.get(candidate.id as string)
        return {
          candidateId: candidate.id as string,
          name: candidate.name,
          yearsOfExperience: candidate.yearsOfExperience,
          degree: candidate.degree,
          skills: candidate.skills,
          prescreen: candidate.prescreenFindings ?? [],
          totalScore: score ? (score.adjustedTotal ?? score.totalScore) : null,
          decision: score?.decision ?? null,
          note: score?.note ?? null,
          revision: score?.revision ?? 0
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
        page,
        pageSize
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
