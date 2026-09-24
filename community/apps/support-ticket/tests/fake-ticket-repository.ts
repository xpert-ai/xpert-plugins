import { FindOperator } from 'typeorm'
import type { Repository } from 'typeorm'
import type { SupportTicket } from '../src/lib/entities'

type WhereInput = Record<string, unknown> | Record<string, unknown>[]

interface FindArgs {
  where?: WhereInput
  order?: Record<string, 'ASC' | 'DESC'>
  take?: number
  skip?: number
}

/**
 * Minimal in-memory stand-in for the TypeORM repository. It only implements the query surface the service
 * uses, so unit tests assert business results instead of SQL. Where arrays are OR-ed and every where object
 * is AND-ed, mirroring the TypeORM semantics the service relies on.
 */
export class FakeTicketRepository {
  rows: SupportTicket[] = []
  /** Arguments of every paged read, so tests can prove filtering and paging happen in the data layer. */
  queries: FindArgs[] = []
  /** Arguments of every aggregate read used for the workbench counters. */
  counts: FindArgs[] = []
  private sequence = 0

  create(input: Partial<SupportTicket>) {
    return { ...input } as SupportTicket
  }

  async save(entity: SupportTicket) {
    if (!entity.id) {
      this.sequence += 1
      entity.id = `ticket-${this.sequence}`
    }
    const index = this.rows.findIndex((row) => row.id === entity.id)
    entity.createdAt = entity.createdAt ?? new Date()
    entity.updatedAt = new Date()
    if (index >= 0) {
      this.rows[index] = entity
    } else {
      this.rows.push(entity)
    }
    return entity
  }

  async find(args: FindArgs = {}) {
    this.queries.push(args)
    return this.page(this.select(args), args)
  }

  async findAndCount(args: FindArgs = {}): Promise<[SupportTicket[], number]> {
    this.queries.push(args)
    const matched = this.select(args)
    return [this.page(matched, args), matched.length]
  }

  async findOne(args: FindArgs = {}) {
    return this.select(args)[0] ?? null
  }

  async count(args: FindArgs = {}) {
    this.counts.push(args)
    return this.select(args).length
  }

  private select(args: FindArgs) {
    const matched = this.rows.filter((row) => matchesWhere(row, args.where))
    const [field, direction] = Object.entries(args.order ?? {})[0] ?? []
    if (field) {
      const factor = direction === 'ASC' ? 1 : -1
      matched.sort(
        (left, right) =>
          factor * compareValues(left[field as keyof SupportTicket], right[field as keyof SupportTicket])
      )
    }
    return matched
  }

  private page(rows: SupportTicket[], args: FindArgs) {
    const start = args.skip ?? 0
    const end = typeof args.take === 'number' ? start + args.take : undefined
    return rows.slice(start, end)
  }
}

export function asRepository(repository: FakeTicketRepository) {
  return repository as unknown as Repository<SupportTicket>
}

function matchesWhere(row: SupportTicket, where?: WhereInput) {
  if (!where) {
    return true
  }
  const alternatives = Array.isArray(where) ? where : [where]
  return alternatives.some((alternative) => matchesAll(row, alternative))
}

function matchesAll(row: SupportTicket, where: Record<string, unknown>) {
  return Object.entries(where).every(([key, expected]) => {
    if (expected === undefined || expected === null) {
      return true
    }
    const actual = (row as unknown as Record<string, unknown>)[key]
    if (expected instanceof FindOperator) {
      return matchesFindOperator(actual, expected)
    }
    return actual === expected
  })
}

function matchesFindOperator(actual: unknown, operator: FindOperator<unknown>) {
  if (operator.type !== 'ilike') {
    throw new Error(`FakeTicketRepository does not support the '${operator.type}' find operator`)
  }
  const needle = String(operator.value)
    .replace(/^%/, '')
    .replace(/%$/, '')
    .replace(/\\(.)/g, '$1')
    .toLowerCase()
  return String(actual ?? '').toLowerCase().includes(needle)
}

function compareValues(left: unknown, right: unknown) {
  const leftValue = left instanceof Date ? left.getTime() : left
  const rightValue = right instanceof Date ? right.getTime() : right
  if (typeof leftValue === 'number' && typeof rightValue === 'number') {
    return leftValue - rightValue
  }
  return String(leftValue ?? '').localeCompare(String(rightValue ?? ''))
}
