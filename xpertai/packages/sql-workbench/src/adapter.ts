import type {
  DatabaseCapabilities,
  DatabaseImportInput,
  DatabaseImportReceipt,
  DatabaseLocation,
  DatabaseObjectDetail,
  DatabaseObjectPage,
  DatabaseObjectRef,
  DatabaseQueryInput,
  DatabaseResult,
  DatabaseValue,
  DatabaseWorkbenchAdapter
} from '@xpert-ai/plugin-sdk/data-workbench'
import { requireReadStatement, splitWorkbenchSql } from './workbench-sql.js'

export interface WorkbenchTransport {
  execute(
    sql: string,
    parameters: DatabaseValue[],
    options: { timeoutMs: number; maxRows: number; signal?: AbortSignal }
  ): Promise<DatabaseResult>
  close(): Promise<void>
  importRows?(input: DatabaseImportInput, signal?: AbortSignal): Promise<DatabaseImportReceipt>
}
/** Connection lifecycle and bounded execution; each plugin owns SQL and location semantics. */
export abstract class SqlWorkbenchAdapter implements DatabaseWorkbenchAdapter {
  abstract readonly engine: string
  protected abstract readonly readTransactionStatement: string | undefined
  protected abstract readonly supportsTransactions: boolean
  protected abstract readonly explainStatement: string
  private transactionOpen = false
  private busy = false
  private closed = false
  constructor(protected readonly transport: WorkbenchTransport, protected readonly initial: DatabaseLocation = {}) {}
  protected abstract quote(name: string): string
  protected abstract ref(object: DatabaseObjectRef): string
  protected abstract assertLocation(location: DatabaseLocation): void
  protected abstract placeholder(index: number): string
  protected abstract paginate(
    sql: string,
    parameters: DatabaseValue[] | undefined,
    limit: number,
    offset: number
  ): { sql: string; parameters: DatabaseValue[] | undefined }
  abstract capabilities(): Promise<DatabaseCapabilities>
  abstract locations(): Promise<DatabaseLocation[]>
  abstract objects(
    input: DatabaseLocation & { search?: string; page?: number; pageSize?: number }
  ): Promise<DatabaseObjectPage>
  abstract describe(object: DatabaseObjectRef): Promise<DatabaseObjectDetail>
  protected async raw(
    sql: string,
    parameters: DatabaseValue[] = [],
    maxRows = 1001,
    signal?: AbortSignal,
    timeoutMs = 30_000
  ) {
    if (this.closed) throw new Error('session_closed')
    return this.transport.execute(sql, parameters, { maxRows, timeoutMs, signal })
  }
  async query(input: DatabaseQueryInput, signal?: AbortSignal): Promise<DatabaseResult> {
    this.assertLocation(input)
    if (input.database && input.database !== this.initial.database) throw new Error('database_requires_new_connection')
    if (input.schema && input.schema !== this.initial.schema) throw new Error('schema_requires_new_connection')
    if (this.busy) throw new Error('session_busy')
    if (input.mode === 'read') {
      requireReadStatement(input.sql)
    }
    const statements = splitWorkbenchSql(input.sql)
    if (statements.length !== 1 || statements[0].effect === 'unsupported') throw new Error('unsupported_statement')
    const limit = Math.max(1, Math.min(input.limit ?? 100, 1000)),
      offset = Math.max(0, Math.min(input.offset ?? 0, 100000))
    if (input.mode === 'write' && !(await this.capabilities()).writes)
      throw new Error('engine_version_writes_unavailable')
    if (input.mode === 'write' && offset) throw new Error('mutation_cannot_be_paginated')
    let sql = statements[0].sql
    let parameters = input.parameters
    if (input.mode === 'read' && ['SELECT', 'WITH'].includes(statements[0].words[0])) {
      ;({ sql, parameters } = this.paginate(sql, parameters, limit, offset))
    } else if (offset) throw new Error('statement_cannot_be_paginated')
    this.busy = true
    let readTransaction = false
    try {
      if (input.mode === 'read' && this.readTransactionStatement !== undefined && !this.transactionOpen) {
        await this.raw(this.readTransactionStatement, [], 1)
        readTransaction = true
      }
      const result = await this.raw(
        sql,
        parameters,
        limit + 1,
        signal,
        Math.max(1, Math.min(input.timeoutMs ?? 30000, 120000))
      )
      const hasMore = result.rows.length > limit || result.truncated
      return { ...result, rows: result.rows.slice(0, limit), hasMore, truncated: result.truncated }
    } finally {
      try {
        if (readTransaction) {
          try {
            await this.raw('ROLLBACK', [], 1)
          } catch {
            await this.close()
          }
        }
      } finally {
        this.busy = false
      }
    }
  }
  async explain(input: Omit<DatabaseQueryInput, 'mode'>, signal?: AbortSignal): Promise<DatabaseResult> {
    const sql = requireReadStatement(input.sql)
    if (!/^(SELECT|WITH)\b/i.test(sql)) throw new Error('explain_requires_select')
    const prefix = this.explainStatement
    return this.query({ ...input, sql: prefix + sql, mode: 'read' }, signal)
  }
  async transaction(action: 'begin' | 'commit' | 'rollback') {
    if (!this.supportsTransactions) throw new Error('transactions_not_supported')
    if (this.busy) throw new Error('session_busy')
    if (action === 'begin' && this.transactionOpen) throw new Error('transaction_already_open')
    if (action !== 'begin' && !this.transactionOpen) throw new Error('transaction_not_open')
    this.busy = true
    try {
      await this.raw(action.toUpperCase(), [], 1)
      this.transactionOpen = action === 'begin'
    } finally {
      this.busy = false
    }
  }
  async importRows(input: DatabaseImportInput, signal?: AbortSignal): Promise<DatabaseImportReceipt> {
    this.assertLocation(input)
    if (this.busy) throw new Error('session_busy')
    if (!(await this.capabilities()).import) throw new Error('engine_version_import_unavailable')
    if (new Set(input.columns).size !== input.columns.length) throw new Error('duplicate_import_columns')
    if (
      !input.rows.length ||
      input.rows.length > 10000 ||
      !input.columns.length ||
      input.columns.length > 500 ||
      input.rows.some((row) => row.length !== input.columns.length)
    )
      throw new Error('invalid_import_shape')
    if (this.transport.importRows) {
      this.busy = true
      try {
        return await this.transport.importRows(input, signal)
      } finally {
        this.busy = false
      }
    }
    if (!this.supportsTransactions) throw new Error('stream_load_required')
    const reference = this.ref({ ...input, name: input.table, kind: 'table' })
    await this.transaction('begin')
    try {
      for (let i = 0; i < input.rows.length; i += 100) {
        const batch = input.rows.slice(i, i + 100),
          values = batch.flat()
        let n = 0
        const placeholders = batch.map((row) => `(${row.map(() => this.placeholder(++n)).join(',')})`).join(',')
        await this.query(
          {
            sql: `INSERT INTO ${reference} (${input.columns
              .map((name) => this.quote(name))
              .join(',')}) VALUES ${placeholders}`,
            parameters: values,
            mode: 'write'
          },
          signal
        )
      }
      await this.transaction('commit')
      return {
        outcome: 'succeeded',
        loadedRows: input.rows.length,
        filteredRows: 0,
        label: input.operationId,
        diagnostics: []
      }
    } catch (error) {
      try {
        await this.transaction('rollback')
      } catch {
        await this.close()
      }
      throw error
    }
  }
  async cancel() {
    await this.close()
  }
  async close() {
    this.closed = true
    await this.transport.close()
  }
}
