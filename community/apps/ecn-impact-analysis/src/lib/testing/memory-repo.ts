import type { FindOptionsWhere } from 'typeorm'

/**
 * Minimal in-memory TypeORM repository stub that actually stores rows, so
 * service tests assert persisted business outcomes (state transitions,
 * idempotency, human-review preservation) rather than "method was called".
 */
export interface MemoryRow {
  id?: string
  createdAt?: Date
  updatedAt?: Date
  [key: string]: unknown
}

export function memoryRepo<T extends MemoryRow>() {
  const rows: T[] = []
  let sequence = 0

  const matches = (row: T, where: Record<string, unknown> | undefined): boolean => {
    if (!where) return true
    return Object.entries(where).every(([key, value]) => {
      if (value === null || value === undefined) return true
      return row[key] === value
    })
  }

  const clone = (row: T): T => ({ ...row })

  const repo = {
    rows,
    create(value: Partial<T>): T {
      return { ...value } as T
    },
    async save(value: T): Promise<T> {
      const existing = value.id ? rows.find((row) => row.id === value.id) : undefined
      if (existing) {
        Object.assign(existing, value, { updatedAt: new Date() })
        return existing
      }
      const now = new Date()
      const stored = { ...value, id: value.id ?? `row-${++sequence}`, createdAt: value.createdAt ?? now, updatedAt: now }
      rows.push(stored)
      return stored
    },
    async update(id: string, patch: Partial<T>): Promise<void> {
      const row = rows.find((candidate) => candidate.id === id)
      if (row) Object.assign(row, patch, { updatedAt: new Date() })
    },
    async findOne(options: { where?: Record<string, unknown> }): Promise<T | null> {
      return rows.find((row) => matches(row, options.where)) ?? null
    },
    async find(options?: { where?: Record<string, unknown>; order?: Record<string, string>; take?: number; skip?: number }): Promise<T[]> {
      let result = rows.filter((row) => matches(row, options?.where))
      const order = options?.order
      if (order?.createdAt === 'ASC') {
        result = [...result].sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0))
      } else if (order?.createdAt === 'DESC') {
        result = [...result].sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
      }
      if (options?.skip) result = result.slice(options.skip)
      if (options?.take) result = result.slice(0, options.take)
      return result.map(clone)
    },
    async findAndCount(options?: {
      where?: Record<string, unknown>
      order?: Record<string, string>
      take?: number
      skip?: number
    }): Promise<[T[], number]> {
      const filtered = rows.filter((row) => matches(row, options?.where))
      const ordered = [...filtered]
      const order = options?.order
      if (order?.createdAt === 'DESC') {
        ordered.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
      }
      const skip = options?.skip ?? 0
      const take = options?.take ?? filtered.length
      return [ordered.slice(skip, skip + take).map(clone), filtered.length]
    },
    createQueryBuilder(): {
      select: () => ReturnType<typeof chain>
      addSelect: () => ReturnType<typeof chain>
      where: () => ReturnType<typeof chain>
      groupBy: () => ReturnType<typeof chain>
      addGroupBy: () => ReturnType<typeof chain>
      getRawMany: () => Promise<Array<Record<string, unknown>>>
    } {
      const chain = () => {
        const api: {
          select: () => typeof api
          addSelect: () => typeof api
          where: () => typeof api
          groupBy: () => typeof api
          addGroupBy: () => typeof api
          getRawMany: () => Promise<Array<Record<string, unknown>>>
        } = {
          select: () => api,
          addSelect: () => api,
          where: () => api,
          groupBy: () => api,
          addGroupBy: () => api,
          getRawMany: async () => {
            // Aggregate itemCount/pendingCount per assessment from stored rows.
            const result: Array<Record<string, unknown>> = []
            const byAssessment = new Map<string, { status: string; count: number }>()
            for (const row of rows) {
              const key = `${String(row['assessmentId'])}::${String(row['status'])}`
              const existing = byAssessment.get(key)
              if (existing) existing.count += 1
              else byAssessment.set(key, { status: String(row['status']), count: 1 })
            }
            for (const [key, entry] of byAssessment) {
              const [assessmentId, status] = key.split('::')
              result.push({ assessmentId, status, count: entry.count })
            }
            return result
          }
        }
        return api
      }
      return chain()
    }
  }
  return repo
}

export type MemoryRepo = ReturnType<typeof memoryRepo>

export function findOptionsWhere(values: Record<string, unknown>): FindOptionsWhere<never> {
  return values as FindOptionsWhere<never>
}
