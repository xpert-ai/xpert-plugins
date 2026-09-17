import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { from as copyFrom } from 'pg-copy-streams'
import { Client, Query, type ClientConfig, type FieldDef, type QueryArrayConfig } from 'pg'
import { SqlDatabaseWorkbenchAdapter, quoteDatabaseIdentifier, type DatabaseColumn, type DatabaseResult, type DatabaseValue, type WorkbenchTransport } from '@xpert-ai/plugin-sdk/data-workbench'

export function createPostgresWorkbench(config: ClientConfig, schema = 'public') {
  // Dedicated parsers preserve int8/numeric, dates, timestamps, JSON and array text exactly.
  const client = new Client({ ...config, connectionTimeoutMillis: 15000, query_timeout: 30000, types: { getTypeParser: () => (value: string) => value } })
  let connected: Promise<void> | undefined, closed = false
  const ensureConnected = () => connected ??= client.connect().then(async () => { await client.query(`SET search_path TO ${quoteDatabaseIdentifier(schema, 'postgres')}`) })
  const transport: WorkbenchTransport = {
    async importRows(input, signal) {
      await ensureConnected()
      const reference=[input.schema||schema,input.table].map((name)=>quoteDatabaseIdentifier(name,'postgres')).join('.')
      const csv=input.rows.map((row)=>row.map((value)=>value===null?'\\N':'"'+String(value).replaceAll('"','""')+'"').join(',')+'\n')
      const timeout=AbortSignal.timeout(120000),boundedSignal=signal?AbortSignal.any([signal,timeout]):timeout
      let commitStarted=false
      try {
        await client.query('BEGIN')
        const stream=client.query(copyFrom(`COPY ${reference} (${input.columns.map((name)=>quoteDatabaseIdentifier(name,'postgres')).join(',')}) FROM STDIN WITH (FORMAT csv, NULL E'\\\\N')`))
        await pipeline(Readable.from(csv),stream,{signal:boundedSignal})
        commitStarted=true
        await client.query('COMMIT')
        return {outcome:'succeeded',label:input.operationId,loadedRows:input.rows.length,filteredRows:0,diagnostics:[]}
      } catch {
        try { await client.query('ROLLBACK') } catch { await client.end();closed=true }
        return {outcome:'unknown',label:input.operationId,diagnostics:[commitStarted?'commit_not_confirmed_do_not_replay':'copy_not_confirmed']}
      }
    },
    async close() { if (!closed) { closed = true; await client.end() } },
    async execute(sql, parameters, options) {
      if (closed) throw new Error('session_closed')
      await ensureConnected()
      return new Promise<DatabaseResult>((resolve, reject) => {
        const began = Date.now(), rows: DatabaseValue[][] = []
        let bytes = 0, truncated = false, settled = false
        const columns = (fields: FieldDef[]): DatabaseColumn[] => fields.map((field, i) => ({ id: `c${i}`, name: field.name, dataType: String(field.dataTypeID) }))
        const cleanup = () => { clearTimeout(timer); options.signal?.removeEventListener('abort', abort) }
        const fail = (code: string) => { if (settled) return; settled = true; cleanup(); closed = true; void client.end(); reject(new Error(code)) }
        const abort = () => fail('execution_cancelled_outcome_unconfirmed')
        const timer = setTimeout(() => fail('execution_timeout_outcome_unconfirmed'), options.timeoutMs)
        if (options.signal?.aborted) { abort(); return }
        options.signal?.addEventListener('abort', abort, { once: true })
        const queryConfig: QueryArrayConfig = { text: sql, values: parameters, rowMode: 'array' }
        const query = new Query(queryConfig)
        query.on('row', (row: unknown[]) => {
          const values = row.map((value): DatabaseValue => value == null ? null : typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string' ? value : JSON.stringify(value))
          bytes += Buffer.byteLength(JSON.stringify(values))
          if (bytes > 8 * 1024 * 1024) { fail('result_byte_limit_exceeded'); return }
          if (rows.length < options.maxRows) rows.push(values); else truncated = true
        })
        query.on('error', (error: Error & { code?: string }) => fail(error.code && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'database_execution_failed'))
        query.on('end', (result: { fields: FieldDef[]; rowCount: number | null }) => { if (settled) return; settled = true; cleanup(); resolve({ columns: columns(result.fields), rows, affectedRows: result.fields.length ? undefined : result.rowCount ?? 0, durationMs: Date.now() - began, hasMore: truncated, truncated, outcome: 'succeeded', diagnostics: [] }) })
        client.query(query)
      })
    }
  }
  return new SqlDatabaseWorkbenchAdapter('postgres', transport, { database: String(config.database || 'postgres'), schema })
}
