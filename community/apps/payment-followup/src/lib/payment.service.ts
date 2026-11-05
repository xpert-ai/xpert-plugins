import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'node:crypto'
import { Repository } from 'typeorm'
import { PaymentCase } from './payment.entity'
import {
  begin,
  confirm,
  DomainError,
  fail,
  inputSchema,
  newState,
  recoverTimeout,
  requireScope,
  sourceLines,
  submit,
  warnings
} from './domain'
import type { Analysis, CaseInput, CaseState, Confirmation, Scope } from './domain'

@Injectable()
export class PaymentService {
  constructor(@InjectRepository(PaymentCase) private readonly repository: Repository<PaymentCase>) {}
  async create(scope: Scope, input: CaseInput, requestKey: string) {
    const where = { ...requireScope(scope), requestKey }
    await this.repository
      .createQueryBuilder()
      .insert()
      .into(PaymentCase)
      .values({ ...where, state: newState(input) })
      .orIgnore()
      .execute()
    const row = await this.repository.findOneByOrFail(where)
    if (JSON.stringify(inputSchema.parse(row.state.input)) !== JSON.stringify(inputSchema.parse(input)))
      throw new DomainError('request_key_conflict')
    return this.dto(row)
  }
  async list(scope: Scope, page = 1, search = '') {
    const where = requireScope(scope)
    const qb = this.repository.createQueryBuilder('item')
    for (const [key, value] of Object.entries(where)) qb.andWhere(`item.${key} = :${key}`, { [key]: value })
    if (search)
      qb.andWhere(
        `(item.state->'input'->>'customerName' ILIKE :search OR item.state->'input'->>'invoiceNumber' ILIKE :search)`,
        { search: `%${search.replace(/[\\%_]/g, '\\$&')}%` }
      )
    const [rows, total] = await qb
      .orderBy('item.updatedAt', 'DESC')
      .skip((page - 1) * 20)
      .take(20)
      .getManyAndCount()
    return {
      items: rows.map((r) => ({
        id: r.id,
        ...r.state.input,
        source: undefined,
        status: r.state.status,
        revision: r.state.revision,
        updatedAt: r.updatedAt.toISOString()
      })),
      total,
      page,
      pageSize: 20
    }
  }
  async read(scope: Scope, id: string) {
    return this.mutate(scope, id, () => {})
  }
  async start(scope: Scope, id: string, revision: number) {
    return this.mutate(scope, id, (state) => begin(state, revision, randomUUID(), new Date()))
  }
  async submit(scope: Scope, id: string, attemptId: string, result: Analysis) {
    return this.mutate(scope, id, (state) => submit(state, attemptId, result, new Date()))
  }
  async fail(scope: Scope, id: string, attemptId: string, code = 'model_failed') {
    return this.mutate(scope, id, (state) => fail(state, attemptId, code, new Date()))
  }
  async confirm(scope: Scope, id: string, revision: number, result: Confirmation) {
    return this.mutate(scope, id, (state) => confirm(state, revision, result, new Date()))
  }
  private async mutate(scope: Scope, id: string, operation: (state: CaseState) => void) {
    return this.repository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(PaymentCase)
      const row = await repository.findOne({
        where: { ...requireScope(scope), id },
        lock: { mode: 'pessimistic_write' }
      })
      if (!row) throw new DomainError('not_found')
      const previous = row.state.revision
      const timedOut = recoverTimeout(row.state, new Date())
      // Persist expiry even when a late submission is rejected after the transaction returns.
      if (!timedOut) operation(row.state)
      if (previous !== row.state.revision) await repository.save(row)
      return this.dto(row)
    })
  }
  private dto(row: PaymentCase) {
    const analysis = row.state.confirmedResult?.analysis ?? row.state.aiResult
    return {
      id: row.id,
      ...row.state,
      sourceLines: sourceLines(row.state.input.source),
      warnings: analysis ? warnings(row.state.input, analysis) : [],
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    }
  }
}
