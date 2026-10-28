import type { DatabaseLocation, DatabaseObjectDetail, DatabaseObjectPage, DatabaseObjectRef, DatabaseQueryInput,
  DatabaseResult, DatabaseValue, DatabaseCapabilities, DatabaseWorkbenchAdapter } from '@xpert-ai/plugin-sdk/data-workbench'
import type { HANAAdapterOptions } from './hana.js'
import { quoteHanaIdentifier, validateHanaRead } from './hana-sql.js'
import { createHanaReadTransport, type HanaReadTransport } from './hana-transport.js'

/** HANA owns its SQL dialect. The host supplies authorized credentials and a dedicated session. */
export class HanaWorkbenchAdapter implements DatabaseWorkbenchAdapter {
  readonly engine = 'hana' as const
  constructor(private readonly transport: HanaReadTransport, private readonly initial: DatabaseLocation) {}

  async capabilities(): Promise<DatabaseCapabilities> {
    return { engine: this.engine, version: '', query: true, explain: false, transactions: false,
      cancel: true, import: false, writes: false, nativeReadOnly: true, objectKinds: ['table', 'view'],
      diagnostics: ['hana_read_only_workbench'] }
  }
  private location(input: DatabaseLocation): string | undefined {
    if (input.engineCatalog) throw new Error('HANA_EXTERNAL_CATALOG_UNSUPPORTED')
    if (input.database && input.database !== this.initial.database) throw new Error('HANA_DATABASE_SWITCH_DENIED')
    const schema = input.schema ?? this.initial.schema
    if (schema) quoteHanaIdentifier(schema)
    return schema
  }
  private metadata(sql: string, parameters: DatabaseValue[] = [], limit = 1000) {
    return this.transport.execute(sql, parameters, { maxRows: limit, timeoutMs: 30000 })
  }
  async locations(): Promise<DatabaseLocation[]> {
    const result = await this.metadata('SELECT SCHEMA_NAME FROM SYS.SCHEMAS ORDER BY SCHEMA_NAME', [], 1000)
    if (result.truncated) throw new Error('HANA_SCHEMA_LIMIT_EXCEEDED')
    return result.rows.map((row) => ({ database: this.initial.database, schema: text(row[0]) }))
  }
  async objects(input: DatabaseLocation & { search?: string; page?: number; pageSize?: number }): Promise<DatabaseObjectPage> {
    const schema = this.location(input)
    if (!schema) throw new Error('HANA_SCHEMA_REQUIRED')
    const page = input.page ?? 1, pageSize = input.pageSize ?? 20
    if (!Number.isInteger(page) || page < 1 || page > 10000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
      throw new Error('HANA_PAGE_INVALID')
    }
    const result = await this.metadata(`SELECT OBJECT_NAME, OBJECT_TYPE FROM (
      SELECT TABLE_NAME AS OBJECT_NAME, 'table' AS OBJECT_TYPE FROM SYS.TABLES WHERE SCHEMA_NAME = ?
      UNION ALL SELECT VIEW_NAME AS OBJECT_NAME, 'view' AS OBJECT_TYPE FROM SYS.VIEWS WHERE SCHEMA_NAME = ?
      ) WHERE OBJECT_NAME LIKE ? ORDER BY OBJECT_NAME, OBJECT_TYPE LIMIT ${pageSize + 1} OFFSET ${(page - 1) * pageSize}`,
      [schema, schema, `%${input.search ?? ''}%`], pageSize + 1)
    return { items: result.rows.slice(0, pageSize).map((row) => ({ database: this.initial.database,
      schema, name: text(row[0]), kind: objectKind(row[1]) })), page, pageSize, hasMore: result.rows.length > pageSize || result.truncated }
  }
  async describe(object: DatabaseObjectRef): Promise<DatabaseObjectDetail> {
    const schema = this.location(object)
    if (!schema) throw new Error('HANA_SCHEMA_REQUIRED')
    quoteHanaIdentifier(object.name)
    if (object.kind !== 'table' && object.kind !== 'view') throw new Error('HANA_OBJECT_KIND_INVALID')
    const table = object.kind === 'table', source = table ? 'TABLE_COLUMNS' : 'VIEW_COLUMNS', name = table ? 'TABLE_NAME' : 'VIEW_NAME'
    const result = await this.metadata(`SELECT COLUMN_NAME, DATA_TYPE_NAME, LENGTH, SCALE, IS_NULLABLE, POSITION, COMMENTS
      FROM SYS.${source} WHERE SCHEMA_NAME = ? AND ${name} = ? ORDER BY POSITION`, [schema, object.name])
    if (result.truncated) throw new Error('HANA_COLUMN_LIMIT_EXCEEDED')
    if (!result.rows.length) throw new Error('HANA_OBJECT_UNAVAILABLE')
    return { object: { ...object, schema, database: this.initial.database },
      columns: result.rows.map((row, index) => ({ id: `c${index}`, name: text(row[0]),
        dataType: text(row[1]) === 'DECIMAL' ? `DECIMAL(${text(row[2])},${text(row[3])})` : text(row[1]),
        nullable: text(row[4]).toUpperCase() === 'TRUE', ordinal: Number(row[5]), comment: text(row[6]) })),
      keys: [], definition: '', editable: false, diagnostics: ['keys_and_ddl_not_inspected'] }
  }
  async query(input: DatabaseQueryInput, signal?: AbortSignal): Promise<DatabaseResult> {
    if (input.mode !== 'read') throw new Error('HANA_READ_ONLY_REQUIRED')
    const schema = this.location(input)
    if (schema && schema !== this.initial.schema) throw new Error('HANA_SCHEMA_REQUIRES_NEW_CONNECTION')
    if (input.offset) throw new Error('HANA_OFFSET_UNSUPPORTED')
    const parameters = input.parameters ?? []
    if (parameters.length > 24 || parameters.some((value) =>
      value !== null && !['string', 'number', 'boolean'].includes(typeof value) ||
      typeof value === 'number' && !Number.isFinite(value))) throw new Error('HANA_PARAMETERS_INVALID')
    const sql = validateHanaRead(input.sql, parameters.length)
    return this.transport.execute(sql, parameters, { maxRows: input.limit ?? 1000, timeoutMs: input.timeoutMs ?? 30000, signal })
  }
  async explain(): Promise<DatabaseResult> { throw new Error('HANA_EXPLAIN_UNSUPPORTED') }
  async transaction(): Promise<void> { throw new Error('HANA_READ_ONLY_REQUIRED') }
  async importRows(): Promise<never> { throw new Error('HANA_READ_ONLY_REQUIRED') }
  cancel() { return this.close() }
  close() { return this.transport.close() }
}

export function createHanaWorkbench(options: HANAAdapterOptions) {
  return new HanaWorkbenchAdapter(createHanaReadTransport(options), { database: options.database, schema: options.catalog })
}
function text(value: DatabaseValue | undefined): string { return value === null || value === undefined ? '' : String(value) }
function objectKind(value: DatabaseValue): 'table' | 'view' {
  if (value === 'table' || value === 'view') return value
  throw new Error('HANA_OBJECT_KIND_INVALID')
}
