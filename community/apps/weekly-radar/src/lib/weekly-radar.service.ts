import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash } from 'node:crypto'
import { Repository } from 'typeorm'
import { WeeklyRadarEntry, WeeklyRadarWeekly } from './entities'
import { applyScopeToQueryBuilder, scopeColumns, scopeWhere } from './scope'
import {
  DEFAULT_RISK_POLICY,
  scanRisks,
  weekKeyOf,
  type RadarEntrySnapshot,
  type WeeklyRadarRiskPolicy
} from './rules'
import type {
  WeeklyRadarEntryDto,
  WeeklyRadarEntryStatus,
  WeeklyRadarMetricsDto,
  WeeklyRadarRiskDto,
  WeeklyRadarScope,
  WeeklyRadarWeeklyDto
} from './types'

export interface WeeklyRadarUpsertEntryInput {
  /** Optional in the type system; the service rejects a missing value at runtime. */
  operationId?: string
  entryId?: string
  weekKey?: string
  title?: string
  status?: WeeklyRadarEntryStatus
  owner?: string | null
  dueDate?: string | null
  evidenceRef?: string | null
  evidenceQuote?: string | null
  note?: string | null
}

export interface WeeklyRadarListEntriesInput {
  weekKey?: string
  status?: WeeklyRadarEntryStatus
  search?: string
  page?: number
  pageSize?: number
}

export interface WeeklyRadarGenerateWeeklyInput {
  /** Optional in the type system; the service falls back to the current week. */
  weekKey?: string
  highlights?: string | null
  nextActions?: string | null
}

@Injectable()
export class WeeklyRadarService {
  constructor(
    @InjectRepository(WeeklyRadarEntry)
    private readonly entryRepository: Repository<WeeklyRadarEntry>,
    @InjectRepository(WeeklyRadarWeekly)
    private readonly weeklyRepository: Repository<WeeklyRadarWeekly>
  ) {}

  /**
   * Create or update one work entry.
   *
   * Idempotency: creating is guarded by the unique (tenant, organization, operationId)
   * index, so a retried call returns the stored entry instead of a duplicate.
   * Updating writes absolute values (status, owner, due date), which is idempotent
   * by construction: replaying the same update cannot produce a second record.
   */
  async upsertEntry(scope: WeeklyRadarScope, input: WeeklyRadarUpsertEntryInput) {
    const operationId = normalizeRequired(input.operationId, 'operationId')

    if (input.entryId) {
      const existing = await this.entryRepository.findOne({
        where: scopeWhere(scope, { id: input.entryId }) as never
      })
      if (!existing) {
        throw new NotFoundException('Weekly Radar entry was not found.')
      }
      const updated = await this.applyEntryUpdate(existing, input)
      return serializeEntry(updated)
    }

    const duplicated = await this.entryRepository.findOne({
      where: scopeWhere(scope, { operationId }) as never
    })
    if (duplicated) {
      const requestHash = hashRequest(input)
      if (duplicated.requestHash && duplicated.requestHash !== requestHash) {
        throw new BadRequestException(
          'operationId was already used with a different payload. Use a new operationId for a different entry.'
        )
      }
      return serializeEntry(duplicated)
    }

    const weekKey = normalizeWeekKey(input.weekKey)
    const title = normalizeRequired(input.title, 'title')
    const status = normalizeStatus(input.status)
    const now = new Date()

    const created = this.entryRepository.create({
      ...scopeColumns(scope),
      operationId,
      requestHash: hashRequest(input),
      weekKey,
      title,
      status,
      owner: input.owner ?? null,
      dueDate: input.dueDate ?? null,
      evidenceRef: input.evidenceRef ?? null,
      evidenceQuote: input.evidenceQuote ?? null,
      note: input.note ?? null,
      lastTouchedAt: now
    })

    try {
      const saved = await this.entryRepository.save(created)
      return serializeEntry(saved)
    } catch (error) {
      const raced = await this.entryRepository.findOne({
        where: scopeWhere(scope, { operationId }) as never
      })
      if (raced) {
        return serializeEntry(raced)
      }
      throw error
    }
  }

  private async applyEntryUpdate(existing: WeeklyRadarEntry, input: WeeklyRadarUpsertEntryInput) {
    if (input.title !== undefined) existing.title = normalizeRequired(input.title, 'title')
    if (input.status !== undefined) existing.status = normalizeStatus(input.status)
    if (input.owner !== undefined) existing.owner = input.owner
    if (input.dueDate !== undefined) existing.dueDate = input.dueDate
    if (input.evidenceRef !== undefined) existing.evidenceRef = input.evidenceRef
    if (input.evidenceQuote !== undefined) existing.evidenceQuote = input.evidenceQuote
    if (input.note !== undefined) existing.note = input.note
    if (input.weekKey !== undefined) existing.weekKey = normalizeWeekKey(input.weekKey)
    existing.lastTouchedAt = new Date()
    const saved = await this.entryRepository.save(existing)
    return saved
  }

  async listEntries(scope: WeeklyRadarScope, input: WeeklyRadarListEntriesInput) {
    const page = normalizePage(input.page)
    const pageSize = normalizePageSize(input.pageSize)
    const qb = this.entryRepository.createQueryBuilder('entry')
    applyScopeToQueryBuilder(qb, 'entry', scope)
    if (input.weekKey) {
      qb.andWhere('entry.weekKey = :weekKey', { weekKey: input.weekKey })
    }
    if (input.status) {
      qb.andWhere('entry.status = :status', { status: input.status })
    }
    if (input.search?.trim()) {
      qb.andWhere('LOWER(entry.title) LIKE :search', { search: `%${input.search.trim().toLowerCase()}%` })
    }
    qb.orderBy('entry.updatedAt', 'DESC')
    qb.skip((page - 1) * pageSize)
    qb.take(pageSize)
    const [items, total] = await qb.getManyAndCount()
    return {
      key: 'entries',
      items: items.map((item) => serializeEntry(item)),
      total,
      page,
      pageSize
    }
  }

  async loadEntries(scope: WeeklyRadarScope, weekKey?: string) {
    const qb = this.entryRepository.createQueryBuilder('entry')
    applyScopeToQueryBuilder(qb, 'entry', scope)
    if (weekKey) {
      qb.andWhere('entry.weekKey = :weekKey', { weekKey })
    }
    qb.orderBy('entry.updatedAt', 'DESC')
    const items = await qb.getMany()
    return items
  }

  async scanRisks(scope: WeeklyRadarScope, weekKey?: string, policy?: Partial<WeeklyRadarRiskPolicy>) {
    const now = new Date()
    const currentWeekKey = weekKey ? normalizeWeekKey(weekKey) : weekKeyOf(now)
    const allEntries = await this.loadEntries(scope)
    // Risks are scanned across every stored entry on purpose: a cross week blocker
    // only becomes visible when last week's entries are compared with this week.
    const risks = scanRisks(allEntries.map(toRadarSnapshot), {
      now,
      currentWeekKey,
      policy: { ...DEFAULT_RISK_POLICY, ...(policy ?? {}) }
    })
    const weekEntries = allEntries.filter((entry) => entry.weekKey === currentWeekKey)
    const metrics = this.computeMetrics(weekEntries, risks, currentWeekKey)
    return {
      weekKey: currentWeekKey,
      risks: risks.map((risk) => toRiskDto(risk)),
      metrics
    }
  }

  private computeMetrics(
    entries: WeeklyRadarEntry[],
    risks: ReturnType<typeof scanRisks>,
    currentWeekKey: string
  ): WeeklyRadarMetricsDto {
    const byStatus: Record<string, number> = {}
    for (const entry of entries) {
      byStatus[entry.status] = (byStatus[entry.status] ?? 0) + 1
    }
    return {
      weekKey: currentWeekKey,
      total: entries.length,
      byStatus,
      openEntries: entries.filter((entry) => entry.status !== 'done').length,
      riskCount: risks.length,
      highRiskCount: risks.filter((risk) => risk.level === 'high').length,
      confirmedWeeks: 0
    }
  }

  /**
   * Assemble the weekly report.
   *
   * The assistant may only write the narrative parts (highlights, next actions).
   * Every number and every risk row is recomputed on the server, so the report can
   * never drift from the stored entries.
   */
  async generateWeekly(scope: WeeklyRadarScope, input: WeeklyRadarGenerateWeeklyInput) {
    const weekKey = normalizeWeekKey(input.weekKey)
    const scan = await this.scanRisks(scope, weekKey)
    const metrics = scan.metrics
    const existing = await this.weeklyRepository.findOne({
      where: scopeWhere(scope, { weekKey }) as never
    })
    const payload = {
      ...scopeColumns(scope),
      weekKey,
      highlights: input.highlights ?? existing?.highlights ?? null,
      nextActions: input.nextActions ?? existing?.nextActions ?? null,
      metrics: metrics as unknown as Record<string, unknown>,
      riskSnapshot: scan.risks as unknown as Record<string, unknown>[],
      status: 'draft',
      generatedAt: new Date()
    }
    const record = existing
      ? Object.assign(existing, payload)
      : this.weeklyRepository.create(payload)
    const saved = await this.weeklyRepository.save(record)
    return serializeWeekly(saved, scan.risks)
  }

  async confirmWeekly(scope: WeeklyRadarScope, weekKey?: string) {
    const normalized = normalizeWeekKey(weekKey)
    const existing = await this.weeklyRepository.findOne({
      where: scopeWhere(scope, { weekKey: normalized }) as never
    })
    if (!existing) {
      throw new NotFoundException('Weekly Radar report was not found. Generate it before confirming.')
    }
    existing.status = 'confirmed'
    const saved = await this.weeklyRepository.save(existing)
    const risks = await this.scanRisks(scope, normalized)
    return serializeWeekly(saved, risks.risks)
  }

  async getWeekly(scope: WeeklyRadarScope, weekKey?: string) {
    const normalized = normalizeWeekKey(weekKey)
    const existing = await this.weeklyRepository.findOne({
      where: scopeWhere(scope, { weekKey: normalized }) as never
    })
    if (!existing) return null
    const scan = await this.scanRisks(scope, normalized)
    return serializeWeekly(existing, scan.risks)
  }

  async listWeeklies(scope: WeeklyRadarScope, limit = 20) {
    const items = await this.weeklyRepository.find({
      where: scopeWhere(scope) as never,
      order: { weekKey: 'DESC' },
      take: Math.min(Math.max(limit, 1), 100)
    })
    return items.map((item) => serializeWeekly(item, (item.riskSnapshot as unknown as WeeklyRadarRiskDto[]) ?? []))
  }
}

function toRadarSnapshot(entry: WeeklyRadarEntry): RadarEntrySnapshot {
  return {
    id: entry.id,
    title: entry.title,
    status: entry.status as WeeklyRadarEntryStatus,
    weekKey: entry.weekKey,
    owner: entry.owner ?? null,
    dueDate: entry.dueDate ?? null,
    evidenceRef: entry.evidenceRef ?? null,
    createdAt: entry.createdAt,
    lastTouchedAt: entry.lastTouchedAt
  }
}

function toRiskDto(risk: ReturnType<typeof scanRisks>[number]): WeeklyRadarRiskDto {
  return {
    id: risk.id,
    level: risk.level,
    title: risk.title,
    detail: risk.detail,
    suggestion: risk.suggestion,
    reasons: risk.reasons,
    entryIds: risk.entryIds,
    entryTitles: risk.entryTitles,
    evidenceRefs: risk.evidenceRefs,
    ageDays: risk.ageDays
  }
}

function serializeEntry(entry: WeeklyRadarEntry): WeeklyRadarEntryDto {
  const ageDays = Math.max(
    0,
    Math.floor((Date.now() - new Date(entry.lastTouchedAt ?? entry.createdAt).getTime()) / 86_400_000)
  )
  return {
    id: entry.id,
    weekKey: entry.weekKey,
    title: entry.title,
    status: entry.status as WeeklyRadarEntryStatus,
    owner: entry.owner ?? null,
    dueDate: entry.dueDate ?? null,
    evidenceRef: entry.evidenceRef ?? null,
    evidenceQuote: entry.evidenceQuote ?? null,
    note: entry.note ?? null,
    ageDays,
    createdAt: entry.createdAt ? new Date(entry.createdAt).toISOString() : null,
    updatedAt: entry.updatedAt ? new Date(entry.updatedAt).toISOString() : null
  }
}

function serializeWeekly(
  weekly: WeeklyRadarWeekly,
  risks: WeeklyRadarRiskDto[] | unknown[]
): WeeklyRadarWeeklyDto {
  return {
    id: weekly.id,
    weekKey: weekly.weekKey,
    highlights: weekly.highlights ?? null,
    nextActions: weekly.nextActions ?? null,
    metrics: (weekly.metrics as unknown as WeeklyRadarMetricsDto) ?? null,
    risks: risks as WeeklyRadarRiskDto[],
    status: weekly.status as 'draft' | 'confirmed',
    generatedAt: weekly.generatedAt ? new Date(weekly.generatedAt).toISOString() : null,
    createdAt: weekly.createdAt ? new Date(weekly.createdAt).toISOString() : null,
    updatedAt: weekly.updatedAt ? new Date(weekly.updatedAt).toISOString() : null
  }
}

function normalizeRequired(value: string | undefined, field: string) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized) {
    throw new BadRequestException(`${field} is required.`)
  }
  return normalized
}

const ENTRY_STATUSES: WeeklyRadarEntryStatus[] = [
  'planned',
  'in_progress',
  'blocked',
  'pending_confirm',
  'ai_failed',
  'done'
]

function normalizeStatus(status: WeeklyRadarEntryStatus | undefined): WeeklyRadarEntryStatus {
  if (!status) return 'planned'
  if (!ENTRY_STATUSES.includes(status)) {
    throw new BadRequestException(`Unsupported entry status: ${status}`)
  }
  return status
}

function normalizeWeekKey(weekKey: string | undefined) {
  const normalized = typeof weekKey === 'string' ? weekKey.trim() : ''
  if (!normalized) return weekKeyOf(new Date())
  if (!/^\d{4}-W\d{2}$/.test(normalized)) {
    throw new BadRequestException(`weekKey must look like 2026-W45, received: ${normalized}`)
  }
  return normalized
}

function normalizePage(page?: number) {
  if (!page || !Number.isFinite(page) || page < 1) return 1
  return Math.floor(page)
}

function normalizePageSize(pageSize?: number) {
  if (!pageSize || !Number.isFinite(pageSize) || pageSize < 1) return 20
  return Math.min(Math.floor(pageSize), 100)
}

function hashRequest(input: WeeklyRadarUpsertEntryInput) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        weekKey: input.weekKey ?? null,
        title: input.title ?? null,
        status: input.status ?? null,
        owner: input.owner ?? null,
        dueDate: input.dueDate ?? null,
        evidenceRef: input.evidenceRef ?? null
      })
    )
    .digest('hex')
}
