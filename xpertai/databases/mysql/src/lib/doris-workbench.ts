import type { DatabaseQueryInput, DatabaseImportInput, DatabaseLocation } from '@xpert-ai/plugin-sdk/data-workbench'
import { requireReadStatement, splitWorkbenchSql, type WorkbenchTransport } from '@xpert-ai/sql-workbench'
import { DorisMetadataAdapter } from './doris-adapter.js'
import { createMysqlTransport, mysqlWorkbenchOptions, type MysqlWireDriver } from './mysql-workbench.js'
import type { DorisAdapterOptions } from './doris.strategy.js'

/** Only substitutes unquoted tokens for validation; the original SQL reaches Doris.
 * Grouped WHERE/HAVING predicates are projected to equivalent TRUE AND predicates
 * to retain compatibility with the existing conservative SQL guard.
 * The shared guard still enforces single statements, unsafe functions and read-only SQL.
 */
export function requireDorisReadStatement(source: string): string {
  const sql = source.trim().replace(/;\s*$/, '').trim()
  const identifier = '(?:`(?:``|[^`])+`|[A-Za-z_][A-Za-z_0-9]*)'
  if (new RegExp(`^SHOW\\s+(?:TABLETS|DATA)\\s+FROM\\s+${identifier}(?:\\s*\\.\\s*${identifier})?$`, 'i').test(sql)) {
    // Let the shared SQL guard lexer validate quoted identifiers and reject executable comments.
    requireReadStatement(sql.replace(/^(SHOW\s+)(TABLETS|DATA)/i, '$1COLUMNS'))
    return sql
  }
  const safe = source.replace(
    /'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\/\*[\s\S]*?\*\/|--[^\n]*|#[^\n]*|\b(?:CURRENT_USER|CURRENT_TIME|UNIX_TIMESTAMP)\b|\b(?:WHERE|HAVING)(?=\s*\()/gi,
    (token) =>
      /^(?:CURRENT_USER|CURRENT_TIME|UNIX_TIMESTAMP)$/i.test(token)
        ? 'NOW'
        : /^(?:WHERE|HAVING)$/i.test(token)
        ? `${token} TRUE AND`
        : token
  )
  requireReadStatement(safe)
  return sql
}

/** Doris INSERT VALUES is independent of UPDATE/DDL version support. Other operations
 * retain the shared SQL guard's existing checks. DB Studio's own page limits remain unchanged.
 */
export class DorisWorkbenchAdapter extends DorisMetadataAdapter {
  private inFlight = false
  private disposed = false
  constructor(private readonly wire: WorkbenchTransport, private readonly location: DatabaseLocation) {
    super(wire, location)
  }
  override async capabilities() {
    const base = await super.capabilities()
    return {
      ...base,
      writes: true,
      import: true,
      diagnostics: [
        ...base.diagnostics.filter((d) => d !== 'doris_version_unverified_writes_disabled'),
        'doris_insert_values_supported_other_writes_version_gated'
      ]
    }
  }
  private assertTarget(input: DatabaseLocation) {
    if (this.disposed) throw new Error('session_closed')
    if (input.engineCatalog && input.engineCatalog !== 'internal') throw new Error('external_catalog_not_supported')
    if (input.database && input.database !== this.location.database) throw new Error('database_requires_new_connection')
    if (input.schema) throw new Error('schema_requires_new_connection')
  }
  override async query(input: DatabaseQueryInput, signal?: AbortSignal) {
    this.assertTarget(input)
    if (this.inFlight) throw new Error('session_busy')
    this.inFlight = true
    try {
      if (input.mode === 'write') {
        const statements = splitWorkbenchSql(input.sql)
        if (statements.length !== 1 || statements[0].effect !== 'write') throw new Error('unsupported_statement')
        // INSERT SELECT and other DML/DDL still require the original version gate.
        if (
          statements[0].words[0] !== 'INSERT' ||
          !statements[0].words.includes('VALUES') ||
          statements[0].words.includes('SELECT')
        ) {
          if (!(await super.capabilities()).writes) throw new Error('engine_version_writes_unavailable')
          return await super.query(input, signal)
        }
        if (input.offset) throw new Error('mutation_cannot_be_paginated')
        return await this.wire.execute(statements[0].sql, input.parameters ?? [], {
          maxRows: 1,
          timeoutMs: bounded(input.timeoutMs ?? 30000, 1, 120000),
          signal
        })
      }
      let sql = requireDorisReadStatement(input.sql)
      const firstWord = splitWorkbenchSql(sql)[0].words[0]
      const limit = bounded(input.limit ?? 100, 1, 50000),
        offset = bounded(input.offset ?? 0, 0, Number.MAX_SAFE_INTEGER)
      const timeoutMs = bounded(input.timeoutMs ?? 30000, 1, 120000)
      if (firstWord === 'SELECT' || firstWord === 'WITH')
        sql = `SELECT * FROM (\n${sql}\n) AS \`_db_studio_page\` LIMIT ${limit + 1} OFFSET ${offset}`
      else if (offset) throw new Error('statement_cannot_be_paginated')
      // Enforce the server-side bound as well as the client's cancellation timer.
      // This trusted statement is never accepted through caller-provided read SQL.
      await this.wire.execute(`SET query_timeout = ${Math.ceil(timeoutMs / 1000)}`, [], {
        maxRows: 1,
        timeoutMs,
        signal
      })
      const result = await this.wire.execute(sql, input.parameters ?? [], { maxRows: limit + 1, timeoutMs, signal })
      return { ...result, rows: result.rows.slice(0, limit), hasMore: result.rows.length > limit || result.truncated }
    } finally {
      this.inFlight = false
    }
  }
  override async explain(input: Omit<DatabaseQueryInput, 'mode'>, signal?: AbortSignal) {
    const sql = requireDorisReadStatement(input.sql)
    const firstWord = splitWorkbenchSql(sql)[0].words[0]
    if (firstWord !== 'SELECT' && firstWord !== 'WITH') throw new Error('explain_requires_select')
    return this.query({ ...input, sql: `EXPLAIN ${sql}`, mode: 'read' }, signal)
  }
  override async importRows(input: DatabaseImportInput, signal?: AbortSignal) {
    this.assertTarget(input)
    if (this.inFlight) throw new Error('session_busy')
    if (
      !input.rows.length ||
      input.rows.length > 50000 ||
      !input.columns.length ||
      input.columns.length > 500 ||
      new Set(input.columns).size !== input.columns.length ||
      input.rows.some((row) => row.length !== input.columns.length)
    )
      throw new Error('invalid_import_shape')
    if (!this.wire.importRows) throw new Error('stream_load_required')
    this.inFlight = true
    try {
      return await this.wire.importRows({ ...input, database: input.database ?? this.location.database }, signal)
    } finally {
      this.inFlight = false
    }
  }
  override async close() {
    this.disposed = true
    await super.close()
  }
}
function bounded(value: number, min: number, max: number) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error('invalid_query_bound')
  return value
}
export function createDorisConnection(
  options: DorisAdapterOptions,
  testDriver?: MysqlWireDriver,
  location: DatabaseLocation = {}
): DorisWorkbenchAdapter {
  const selected = mysqlWorkbenchOptions(options, location)
  return new DorisWorkbenchAdapter(createMysqlTransport(selected, 'doris', testDriver, true), {
    database: selected.catalog,
    engineCatalog: 'internal'
  })
}
