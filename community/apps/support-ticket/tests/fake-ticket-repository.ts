import type { Repository } from 'typeorm'
import type { SupportTicket } from '../src/lib/entities'

interface FindArgs {
  where?: Record<string, unknown>
  order?: Record<string, 'ASC' | 'DESC'>
  take?: number
}

/**
 * Minimal in-memory stand-in for the TypeORM repository. It only implements the query
 * surface the service uses, so unit tests assert business results instead of SQL.
 */
export class FakeTicketRepository {
  rows: SupportTicket[] = []
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
    const matched = this.rows.filter((row) => matches(row, args.where))
    const [field, direction] = Object.entries(args.order ?? {})[0] ?? []
    if (field) {
      const factor = direction === 'ASC' ? 1 : -1
      matched.sort((left, right) => {
        const leftValue = left[field as keyof SupportTicket] as unknown as number
        const rightValue = right[field as keyof SupportTicket] as unknown as number
        return (Number(leftValue) - Number(rightValue)) * factor
      })
    }
    return typeof args.take === 'number' ? matched.slice(0, args.take) : matched
  }

  async findOne(args: FindArgs = {}) {
    return this.rows.find((row) => matches(row, args.where)) ?? null
  }

  async count(args: FindArgs = {}) {
    return this.rows.filter((row) => matches(row, args.where)).length
  }
}

export function asRepository(repository: FakeTicketRepository) {
  return repository as unknown as Repository<SupportTicket>
}

function matches(row: SupportTicket, where?: Record<string, unknown>) {
  if (!where) {
    return true
  }
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined || value === null) {
      return true
    }
    return (row as Record<string, unknown>)[key] === value
  })
}
