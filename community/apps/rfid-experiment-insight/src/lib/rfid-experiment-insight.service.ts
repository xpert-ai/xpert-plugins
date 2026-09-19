import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import { createHash, randomUUID } from 'node:crypto'
import { ExperimentAnalysis } from './entities/experiment-analysis.entity.js'
import { aiSummarySchema, importCsvSchema, type AnalysisAttempt, type ExperimentScope, type PreparedAnalysis } from './experiment-contracts.js'

import { computeExperimentStatistics, parseExperimentCsv } from './experiment-statistics.js'

export const ANALYSIS_TIMEOUT_MS = 120000

@Injectable()
export class RfidExperimentInsightService {
  constructor(@InjectRepository(ExperimentAnalysis) private readonly repository: Repository<ExperimentAnalysis>) {}

  async importCsv(scope: ExperimentScope, input: unknown) {
    const data = importCsvSchema.parse(input)
    const where = scopedWhere(scope)
    const importKey = createHash('sha256').update(JSON.stringify([scope.tenantId, scope.organizationId ?? null, scope.workspaceId ?? null, scope.projectId ?? null, scope.userId, data.requestId])).digest('hex')
    const existing = await this.repository.findOne({ where: { ...where, importKey } })
    if (existing) return publicAnalysis(existing)
    const rows = parseExperimentCsv(data.csv)
    const statistics = computeExperimentStatistics(rows)
    await this.repository.createQueryBuilder().insert().into(ExperimentAnalysis).values({
      tenantId: scope.tenantId, organizationId: scope.organizationId ?? null,
      workspaceId: scope.workspaceId ?? null, projectId: scope.projectId ?? null, createdById: scope.userId,
      importKey, name: data.name, fileName: data.fileName, status: 'DRAFT', rows, statistics,
      datasetSummary: { recordCount: rows.length, conditionCount: statistics.conditions.length },
      aiSummary: null, errorMessage: null, attemptId: null, attemptDeadline: null, confirmedAt: null
    }).orIgnore().execute()
    const saved = await this.repository.findOne({ where: { ...where, importKey } })
    if (!saved) throw new Error('The experiment could not be persisted.')
    return publicAnalysis(saved)
  }

  async getWorkbenchData(scope: ExperimentScope, analysisId?: string) {
    await this.expireAttempts(scope)
    const items = await this.repository.find({
      where: scopedWhere(scope), order: { createdAt: 'DESC' }, take: 100,
      select: ['id', 'name', 'fileName', 'status', 'createdAt', 'confirmedAt', 'datasetSummary']
    })
    return { items, total: items.length, item: analysisId ? publicAnalysis(await this.requireAnalysis(scope, analysisId)) : undefined,
      summary: { historyLimit: 100 } }
  }

  // Workbench prepares a host-owned Assistant command. This service never calls a model.
  async prepareAnalysis(scope: ExperimentScope, id: string): Promise<PreparedAnalysis> {
    await this.expireAttempts(scope)
    const record = await this.requireAnalysis(scope, id)
    if (record.status === 'ANALYZING') throw new ConflictException('Analysis is already running; refresh its status.')
    if (record.status === 'COMPLETED') throw new ConflictException('Analysis is completed; review and confirm its result.')
    const attemptId = randomUUID()
    const result = await this.repository.update({ ...scopedWhere(scope), id, status: record.status }, {
      status: 'ANALYZING', attemptId, attemptDeadline: String(Date.now() + ANALYSIS_TIMEOUT_MS),
      errorMessage: null, aiSummary: null, confirmedAt: null
    })
    if (result.affected !== 1) throw new ConflictException('Analysis state changed; refresh and retry.')
    return {
      analysisId: id, attemptId,
      command: {
        type: 'assistant-message', commandKey: 'assistant.chat.send_message',
        payload: {
          text: [
            'Analyze this RFID experiment using the registered tools.',
            `analysisId: ${id}`, `attemptId: ${attemptId}`,
            'Call analyze_experiment with these exact ids to read deterministic statistics.',
            'Explain only the returned statistics. Do not recompute statistics or infer a causal mechanism.',
            'Call save_analysis with the same ids and the four-part AI interpretation.',
            'The user will review and confirm the result in the Workbench.'
          ].join('\n')
        }
      }
    }
  }

  // Tool reads persisted deterministic results; the Assistant's model owns interpretation.
  async analyzeExperiment(scope: ExperimentScope, attempt: AnalysisAttempt) {
    const record = await this.requireActiveAttempt(scope, attempt)
    return { ...attempt, statistics: record.statistics, datasetSummary: record.datasetSummary }
  }

  // Saving AI output does not imply human confirmation.
  async saveInterpretation(scope: ExperimentScope, attempt: AnalysisAttempt, input: unknown) {
    const aiSummary = aiSummarySchema.parse(input)
    await this.expireAttempts(scope)
    const record = await this.requireAnalysis(scope, attempt.analysisId)
    if (record.status === 'COMPLETED' && record.attemptId === attempt.attemptId) return publicAnalysis(record)
    await this.requireActiveAttempt(scope, attempt)
    const result = await this.repository.update(activeWhere(scope, attempt), {
      status: 'COMPLETED', aiSummary, errorMessage: null, attemptDeadline: null
    })
    if (result.affected !== 1) throw new ConflictException('Analysis attempt is no longer active.')
    return publicAnalysis(await this.requireAnalysis(scope, attempt.analysisId))
  }

  async reportFailure(scope: ExperimentScope, attempt: AnalysisAttempt, reason: 'model' | 'dispatch' | 'incomplete') {
    const messages = {
      model: 'Assistant model failed. Check its model configuration and retry. Statistics are preserved.',
      dispatch: 'Could not send the analysis request to the Assistant. Statistics are preserved; retry.',
      incomplete: 'Assistant finished without saving a valid interpretation. Statistics are preserved; retry.'
    }
    await this.repository.update(activeWhere(scope, attempt), { status: 'FAILED', errorMessage: messages[reason], attemptDeadline: null })
  }

  async confirmAnalysis(scope: ExperimentScope, id: string, confirmed: boolean) {
    if (confirmed !== true) throw new BadRequestException('Explicit user confirmation is required.')
    const record = await this.requireAnalysis(scope, id)
    if (record.status !== 'COMPLETED' || !record.aiSummary) throw new ConflictException('Only completed analyses can be confirmed.')
    if (!record.confirmedAt) await this.repository.update({ ...scopedWhere(scope), id, status: 'COMPLETED', confirmedAt: IsNull() }, { confirmedAt: new Date().toISOString() })
    return publicAnalysis(await this.requireAnalysis(scope, id))
  }

  private async requireAnalysis(scope: ExperimentScope, id: string) {
    const record = await this.repository.findOne({ where: { ...scopedWhere(scope), id } })
    if (!record) throw new NotFoundException('Experiment analysis was not found.')
    return record
  }

  private async requireActiveAttempt(scope: ExperimentScope, attempt: AnalysisAttempt) {
    await this.expireAttempts(scope)
    const record = await this.requireAnalysis(scope, attempt.analysisId)
    if (record.status !== 'ANALYZING' || record.attemptId !== attempt.attemptId) throw new ConflictException('Analysis attempt is no longer active. Select or retry the analysis in the Workbench.')
    return record
  }

  private async expireAttempts(scope: ExperimentScope) {
    const active = await this.repository.find({ where: { ...scopedWhere(scope), status: 'ANALYZING' } })
    for (const record of active) {
      if (!record.attemptDeadline || Number(record.attemptDeadline) <= Date.now()) {
        await this.repository.update({ ...scopedWhere(scope), id: record.id, status: 'ANALYZING', attemptId: record.attemptId ?? IsNull() }, {
          status: 'FAILED', errorMessage: 'Assistant analysis timed out or was interrupted. Statistics are preserved; retry the analysis.', attemptDeadline: null
        })
      }
    }
  }
}

export function scopedWhere(scope: ExperimentScope) {
  if (!scope.tenantId || !scope.userId) throw new BadRequestException('Authenticated tenant and user context are required.')
  return { tenantId: scope.tenantId, createdById: scope.userId, organizationId: scope.organizationId ?? IsNull(),
    workspaceId: scope.workspaceId ?? IsNull(), projectId: scope.projectId ?? IsNull() }
}
function activeWhere(scope: ExperimentScope, attempt: AnalysisAttempt) { return { ...scopedWhere(scope), id: attempt.analysisId, status: 'ANALYZING' as const, attemptId: attempt.attemptId } }
function publicAnalysis(record: ExperimentAnalysis) {
  const { rows, importKey, tenantId, organizationId, workspaceId, projectId, createdById, attemptId, attemptDeadline, ...result } = record
  return result
}
