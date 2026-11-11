/** 轻量 TypeORM 替身：只实现本服务用到的方法，断言行级业务结果而非调用次数。 */
export class FakeRepo<T extends Record<string, unknown>> {
  rows: Array<Record<string, unknown>> = []

  create(fields: Partial<T>): T {
    return { ...fields } as T
  }

  async save(row: Record<string, unknown>) {
    const index = this.rows.findIndex((existing) => existing['id'] !== undefined && existing['id'] === row['id'])
    if (index >= 0) this.rows[index] = { ...this.rows[index], ...row }
    else {
      row['id'] = `id-${this.rows.length + 1}`
      row['createdAt'] = row['createdAt'] ?? new Date()
      this.rows.push(row)
    }
    return row
  }

  async find(options?: { where?: Record<string, unknown>; take?: number }) {
    const matched = this.rows.filter((row) => matches(row, options?.where ?? {}))
    return options?.take === undefined ? matched : matched.slice(0, options.take)
  }

  async findOne(options: { where: Record<string, unknown> }) {
    return this.rows.find((row) => matches(row, options.where)) ?? null
  }

  async findAndCount(options: { where: Record<string, unknown>; skip?: number; take?: number }) {
    const matched = this.rows.filter((row) => matches(row, options.where))
    const skip = options.skip ?? 0
    return [matched.slice(skip, options.take === undefined ? undefined : skip + options.take), matched.length]
  }
}

export function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where ?? {}).every(([key, expected]) => {
    if (expected && typeof expected === 'object' && (expected as { _type?: string })._type === 'isNull') {
      return row[key] === null || row[key] === undefined
    }
    return row[key] === expected
  })
}
