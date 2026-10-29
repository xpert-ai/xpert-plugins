import hanaClient, { type Connection, type HanaColumnInfo, type ResultSet, type Statement } from '@sap/hana-client'
import type { DatabaseResult, DatabaseValue } from '@xpert-ai/plugin-sdk/data-workbench'
import type { HANAAdapterOptions } from './hana.js'

class HanaReadError extends Error {}

function isUnsupportedStatementTimeout(error: unknown): boolean {
  // The native client reports this capability rejection with a generic HY000/-1 code.
  return error instanceof Error && 'code' in error && error.code === -1 &&
    'sqlState' in error && error.sqlState === 'HY000' &&
    error.message === 'Query timeout is not supported by the HANA server.'
}

export interface HanaReadOptions { timeoutMs: number; maxRows: number; signal?: AbortSignal }
export interface HanaReadTransport {
  execute(sql: string, parameters: DatabaseValue[], options: HanaReadOptions): Promise<DatabaseResult>
  close(): Promise<void>
}

export function normalizeHanaCell(value: unknown, type: string): DatabaseValue {
  if (value === null) return null
  if (['DECIMAL', 'SMALLDECIMAL', 'BIGINT'].includes(type)) {
    if (typeof value === 'string') return value
    if (typeof value === 'bigint') return String(value)
    if (type === 'BIGINT' && typeof value === 'number' && Number.isSafeInteger(value)) return String(value)
    throw new HanaReadError('HANA_EXACT_NUMBER_REQUIRED')
  }
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  throw new HanaReadError('HANA_CELL_UNSUPPORTED')
}

/** One disposable, read-only connection per scoped adapter. Never reuse the legacy write connection. */
export function createHanaReadTransport(options: HANAAdapterOptions, connection: Connection = hanaClient.createConnection()): HanaReadTransport {
  let connected = false, closed = false, busy = false
  let nativeTimeoutSupported = true
  let closePromise: Promise<void> | undefined
  const close = () => closePromise ??= (async () => {
    closed = true
    // Cleanup callbacks can themselves stall after failed native I/O. Bound both steps.
    await cleanup((done) => connection.abort(done))
    await cleanup((done) => connection.disconnect(done))
  })()
  return {
    close,
    async execute(sql, parameters, budget) {
      if (closed) throw new HanaReadError('HANA_SESSION_CLOSED')
      if (busy) throw new HanaReadError('HANA_SESSION_BUSY')
      if (!Number.isInteger(budget.maxRows) || budget.maxRows < 1 || budget.maxRows > 10000 ||
          !Number.isFinite(budget.timeoutMs) || budget.timeoutMs <= 0) throw new HanaReadError('HANA_LIMIT_INVALID')
      budget.signal?.throwIfAborted()
      busy = true
      const started = Date.now(), deadline = started + Math.min(budget.timeoutMs, 30000)
      let statement: Statement | undefined, cursor: ResultSet | undefined, timedOut = false
      let interrupt: (error: Error) => void = () => undefined
      const interrupted = new Promise<never>((_, reject) => { interrupt = reject })
      const abort = () => {
        interrupt(new HanaReadError(timedOut ? 'HANA_QUERY_TIMEOUT' : 'HANA_QUERY_CANCELLED'))
        void close()
      }
      const timer = setTimeout(() => { timedOut = true; abort() }, deadline - Date.now())
      budget.signal?.addEventListener('abort', abort, { once: true })
      const remaining = () => {
        budget.signal?.throwIfAborted()
        if (closed || Date.now() >= deadline) throw new HanaReadError('HANA_QUERY_TIMEOUT')
        return Math.max(1, deadline - Date.now())
      }
      const run = async (): Promise<DatabaseResult> => {
        if (!connected) {
          await new Promise<void>((resolve, reject) => connection.connect({
            serverNode: `${options.host}:${options.port}`, uid: options.username, pwd: options.password,
            databaseName: options.database, currentSchema: options.catalog,
            connectTimeout: remaining(), communicationTimeout: remaining(),
            reconnect: false
          }, (error) => {
            if (closed) {
              void cleanup((done) => connection.disconnect(done))
              reject(new HanaReadError('HANA_SESSION_CLOSED'))
            } else if (error) reject(new HanaReadError('HANA_CONNECTION_FAILED'))
            else resolve()
          }))
          remaining()
          connection.setAutoCommit(false)
          // Fail closed if the server cannot establish a native read-only session.
          await new Promise<void>((resolve, reject) => connection.exec('SET TRANSACTION READ ONLY',
            (error) => error ? reject(new HanaReadError('HANA_READ_ONLY_UNAVAILABLE')) : resolve()))
          connected = true
        }
        remaining()
        statement = await new Promise<Statement>((resolve, reject) => connection.prepare(sql, (error, prepared) => {
          if (error || !prepared) reject(new HanaReadError('HANA_PREPARE_FAILED'))
          else if (closed) {
            void cleanup((done) => prepared.drop(done))
            reject(new HanaReadError('HANA_SESSION_CLOSED'))
          } else resolve(prepared)
        }))
        const query = () => new Promise<ResultSet>((resolve, reject) => statement!.execQuery(parameters,
          { communicationTimeout: remaining() }, (error, result) => {
            if (closed) {
              if (result) void cleanup((done) => result.close(done))
              reject(new HanaReadError('HANA_SESSION_CLOSED'))
            } else if (error || !result) {
              reject(error ?? new HanaReadError('HANA_QUERY_FAILED'))
            } else resolve(result)
          }))
        try {
          if (nativeTimeoutSupported) statement.setTimeout(Math.max(1, Math.ceil(remaining() / 1000)))
          cursor = await query()
        } catch (error) {
          if (!nativeTimeoutSupported || !isUnsupportedStatementTimeout(error)) {
            throw error instanceof HanaReadError ? error : new HanaReadError('HANA_QUERY_FAILED')
          }
          // Retry only this capability rejection, on the same read-only session and deadline.
          remaining()
          nativeTimeoutSupported = false
          statement.setTimeout(0)
          cursor = await query().catch((error: unknown) => {
            throw error instanceof HanaReadError ? error : new HanaReadError('HANA_QUERY_FAILED')
          })
        }
        const info = cursor.getColumnInfo()
        const columns = info.map((column, index) => ({ id: `c${index}`, name: column.columnName,
          dataType: column.nativeTypeName, nullable: column.nullable !== 0 }))
        const rows: DatabaseValue[][] = []
        let bytes = 0, truncated = false
        while (await new Promise<boolean>((resolve, reject) => cursor!.next((error, hasRow) =>
          error ? reject(new HanaReadError('HANA_FETCH_FAILED')) : resolve(hasRow === true)))) {
          remaining()
          if (rows.length === budget.maxRows) { truncated = true; break }
          const row: DatabaseValue[] = []
          for (let index = 0; index < info.length; index++) {
            rejectLargeCell(cursor, info[index], index)
            row.push(normalizeHanaCell(cursor.getValue<unknown>(index), info[index].nativeTypeName))
          }
          bytes += Buffer.byteLength(JSON.stringify(row))
          if (bytes > 8 * 1024 * 1024) throw new HanaReadError('HANA_RESULT_BYTE_LIMIT')
          rows.push(row)
        }
        return { columns, rows, durationMs: Date.now() - started, hasMore: truncated, truncated,
          outcome: 'succeeded', diagnostics: [] }
      }
      try {
        return await Promise.race([run(), interrupted])
      } catch (error) {
        void close()
        throw error instanceof HanaReadError ? error : new HanaReadError('HANA_DRIVER_FAILED')
      } finally {
        clearTimeout(timer)
        budget.signal?.removeEventListener('abort', abort)
        if (!closed) {
          if (cursor && !await cleanup((done) => cursor!.close(done))) void close()
          if (statement && !await cleanup((done) => statement!.drop(done))) void close()
        }
        busy = false
      }
    }
  }
}

function rejectLargeCell(cursor: ResultSet, column: HanaColumnInfo, index: number) {
  // Unbounded LOBs/arrays/binary/spatial values need an explicit SQL conversion to a scalar.
  if (['BLOB', 'CLOB', 'NCLOB', 'TEXT', 'BINTEXT', 'BINARY', 'VARBINARY', 'ST_GEOMETRY', 'ST_POINT', 'REAL_VECTOR', 'HALF_VECTOR', 'ARRAY'].includes(column.nativeTypeName)) {
    throw new HanaReadError('HANA_COLUMN_TYPE_UNSUPPORTED')
  }
  if (cursor.getValueLength(index) > 1024 * 1024) throw new HanaReadError('HANA_CELL_BYTE_LIMIT')
}

function cleanup(invoke: (done: () => void) => void): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 250)
    const done = () => { clearTimeout(timer); resolve(true) }
    try { invoke(done) } catch { clearTimeout(timer); resolve(false) }
  })
}
