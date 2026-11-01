import { MysqlWorkbenchAdapter } from './mysql-adapter.js'
import { DorisMetadataAdapter } from './doris-adapter.js'
import type { WorkbenchTransport } from '@xpert-ai/sql-workbench'
import { createRequire } from 'node:module'
import type { ConnectionConfig } from 'mysql'
import type { ConnectionOptions } from 'mysql2'
import { type DatabaseLocation, type DatabaseColumn, type DatabaseResult, type DatabaseValue } from '@xpert-ai/plugin-sdk/data-workbench'
import type { MysqlAdapterOptions } from './mysql.js'
import { createDorisStreamLoad } from './doris-stream-load.js'

const require = createRequire(import.meta.url)

interface WireField { name: string; table?: string; orgName?: string; type?: number; columnType?: number }
interface CastField { type: string; string(): string | null; buffer(): Buffer | null }
interface QueryEvents {
  on(event: 'fields', callback: (fields: WireField[] | undefined) => void): this
  on(event: 'result', callback: (packet: unknown) => void): this
  on(event: 'error', callback: (error: { code?: string; fatal?: boolean }) => void): this
  on(event: 'end', callback: () => void): this
}
export interface QueryConfig { sql: string; values: DatabaseValue[]; timeout: number; typeCast: (field: CastField) => DatabaseValue }
const scalar = (field: CastField): DatabaseValue => ['BIT', 'GEOMETRY'].includes(field.type) ? field.buffer()?.toString('base64') ?? null : field.string()

export interface MysqlWireDriver {query(query:QueryConfig):QueryEvents;destroy():void}

/** Collect cells during decoding, before object rows can overwrite duplicate column names. */
export function createMysqlTransport(options: MysqlAdapterOptions, engine: 'mysql' | 'doris', testDriver?:MysqlWireDriver, preserveServerErrors = false): WorkbenchTransport {
  const config: Omit<ConnectionOptions,'flags'> = {
    host: options.host, port: options.port || (engine === 'doris' ? 9030 : 3306), user: options.username,
    password: options.password, database: options.catalog, charset: 'UTF8MB4_GENERAL_CI',
    multipleStatements: false, supportBigNumbers: true, bigNumberStrings: true, dateStrings: true,
    connectTimeout: 15000,
    ...(options.use_ssl ? { ssl: { ca: options.ssl_cacert, cert: options.ssl_cert, key: options.ssl_key, rejectUnauthorized: true } } : {})
  }
  let closed = false
  let driver = testDriver
  let failConnection: ((code: string) => void) | undefined
  const connectionError = (error: { code?: string }) => {
    if (failConnection) failConnection(error.code && /^[A-Z_0-9]+$/.test(error.code) ? error.code : 'database_connection_failed')
    else { closed = true; driver?.destroy() }
  }
  // Validation can reject a query before any I/O. Do not start a handshake that close() races to destroy.
  const getDriver = () => driver ??= (engine === 'doris' ? (() => {
    const mysqlConnection: typeof import('mysql').createConnection = require('mysql').createConnection
    const connection = mysqlConnection({...config, flags:'-LOCAL_FILES'} as ConnectionConfig)
    connection.on('error', connectionError)
    return { query:(query:QueryConfig):QueryEvents=>connection.query(query),destroy:()=>connection.destroy() }
  })() : (() => {
    const mysql2Connection: typeof import('mysql2').createConnection = require('mysql2').createConnection
    const connection = mysql2Connection({...config,flags:['-LOCAL_FILES']})
    connection.on('error', connectionError)
    return { query:(query:QueryConfig):QueryEvents=>connection.query(query),destroy:()=>connection.destroy() }
  })())
  let parameterMode: Promise<void> | undefined
  // Both drivers implement the documented query event and typeCast interfaces.
  const start = (query: QueryConfig): QueryEvents => getDriver().query(query)
  const transport: WorkbenchTransport = {
    async close() { if (!closed) { closed = true; driver?.destroy() } },
    async execute(sql, parameters, queryOptions) {
      if (parameters.length) {
        parameterMode ??= transport.execute('SELECT @@session.sql_mode AS sql_mode', [], { timeoutMs: 15000, maxRows: 1 }).then((result) => {
          const mode = result.rows[0]?.[0]
          if (typeof mode !== 'string' || mode.split(',').includes('NO_BACKSLASH_ESCAPES')) throw new Error('parameter_sql_mode_unsupported')
        })
        await parameterMode
      }
      if (closed) return Promise.reject(new Error('session_closed'))
      return new Promise<DatabaseResult>((resolve, reject) => {
        const began = Date.now(), rows: DatabaseValue[][] = []
        let columns: DatabaseColumn[] = [], current: DatabaseValue[] = [], affectedRows: number | undefined, truncated = false, bytes = 0, settled = false
        const cleanup = () => { clearTimeout(timer); queryOptions.signal?.removeEventListener('abort', abort); failConnection = undefined }
        const fail = (code: string, destroy = true) => { if (settled) return; settled = true; cleanup(); if (destroy) { closed = true; driver?.destroy() }; reject(new Error(code)) }
        failConnection = fail
        const abort = () => fail('execution_cancelled_outcome_unconfirmed')
        const timer = setTimeout(() => fail('execution_timeout_outcome_unconfirmed'), queryOptions.timeoutMs)
        if (queryOptions.signal?.aborted) { abort(); return }
        queryOptions.signal?.addEventListener('abort', abort, { once: true })
        let query: QueryEvents
        try { query = start({ sql, values: parameters, timeout: queryOptions.timeoutMs, typeCast: (field) => { const value = scalar(field); current.push(value); return value } }) }
        catch { fail('database_execution_failed'); return }
        query.on('fields', (fields) => { columns = (fields ?? []).map((field, i) => ({ id: `c${i}`, name: field.name, dataType: String(field.columnType ?? field.type ?? ''), sourceColumn: field.orgName, sourceTable: field.table })) })
        query.on('result', (packet: unknown) => {
          if (columns.length) {
            bytes += Buffer.byteLength(JSON.stringify(current))
            if (bytes > 8 * 1024 * 1024) { fail('result_byte_limit_exceeded'); return }
            if (rows.length < queryOptions.maxRows) rows.push(current); else truncated = true
            current = []
          } else if (packet && typeof packet === 'object' && 'affectedRows' in packet && typeof packet.affectedRows === 'number') affectedRows = packet.affectedRows
        })
        // Driver errors can contain SQL and credentials. Only the code crosses this boundary.
        query.on('error', (error: { code?: string; fatal?: boolean }) => fail(error.code && /^[A-Z_0-9]+$/.test(error.code) ? error.code : 'database_execution_failed', !(preserveServerErrors && error.fatal !== true && /^ER_/.test(error.code ?? ''))))
        query.on('end', () => { if (settled) return; settled = true; cleanup(); resolve({ columns, rows, affectedRows, durationMs: Date.now() - began, hasMore: truncated, truncated, outcome: 'succeeded', diagnostics: [] }) })
      })
    },
    ...(engine === 'doris' ? { importRows: createDorisStreamLoad(options) } : {})
  }
  return transport
}

export function mysqlWorkbenchOptions(options: MysqlAdapterOptions, location: DatabaseLocation = {}): MysqlAdapterOptions {
  if (location.engineCatalog && location.engineCatalog !== 'internal') throw new Error('external_catalog_not_supported')
  if (location.schema) throw new Error('schema_not_supported')
  return { ...options, catalog: location.database ?? options.catalog }
}
export function createMysqlWorkbench(options: MysqlAdapterOptions, engine: 'mysql' | 'doris', testDriver?: MysqlWireDriver, location: DatabaseLocation = {}) {
  const selected = mysqlWorkbenchOptions(options, location)
  const transport = createMysqlTransport(selected, engine, testDriver)
  return engine === 'mysql'
    ? new MysqlWorkbenchAdapter(transport, { database: selected.catalog })
    : new DorisMetadataAdapter(transport, { database: selected.catalog, engineCatalog: 'internal' })
}
