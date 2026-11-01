import type {
  DatabaseCapabilities,
  DatabaseColumn,
  DatabaseKey,
  DatabaseLocation,
  DatabaseObjectDetail,
  DatabaseObjectPage,
  DatabaseObjectRef,
  DatabaseResult,
  DatabaseValue
} from '@xpert-ai/plugin-sdk/data-workbench'
import { SqlWorkbenchAdapter, quoteSqlIdentifier } from '@xpert-ai/sql-workbench'
import { paginateMysqlQuery } from './mysql-pagination.js'
const number = (value: DatabaseValue | undefined) => Number(value ?? 0)
const string = (value: DatabaseValue | undefined) => (value == null ? '' : String(value))
const cell = (result: DatabaseResult, row: DatabaseValue[], name: string) =>
  row[result.columns.findIndex((column) => column.name.toLowerCase() === name.toLowerCase())]
export class MysqlWorkbenchAdapter extends SqlWorkbenchAdapter {
  readonly engine = 'mysql'
  protected readonly supportsTransactions = true
  private version?: string
  protected readonly readTransactionStatement = 'START TRANSACTION READ ONLY'
  protected readonly explainStatement = 'EXPLAIN FORMAT=JSON '
  protected placeholder(_index: number) {
    return '?'
  }
  protected paginate(sql: string, parameters: DatabaseValue[] | undefined, limit: number, offset: number) {
    return paginateMysqlQuery(sql, parameters, limit, offset)
  }
  protected quote(name: string) {
    return quoteSqlIdentifier(name, '`')
  }
  protected ref(object: DatabaseObjectRef) {
    this.assertLocation(object)
    const namespace = object.database ?? this.initial.database
    if (!namespace) throw new Error('database_required')
    return `${this.quote(namespace)}.${this.quote(object.name)}`
  }
  protected assertLocation(location: DatabaseLocation) {
    if (location.engineCatalog && location.engineCatalog !== 'internal')
      throw new Error('external_catalog_not_supported')
  }
  async capabilities(): Promise<DatabaseCapabilities> {
    if (!this.version) {
      const result = await this.raw('SELECT version() AS version', [], 1)
      this.version = string(result.rows[0]?.[0])
    }
    return {
      engine: this.engine,
      version: this.version,
      query: true,
      explain: true,
      transactions: true,
      cancel: true,
      import: true,
      writes: true,
      nativeReadOnly: true,
      objectKinds: ['table', 'view'],
      diagnostics: []
    }
  }
  async locations(): Promise<DatabaseLocation[]> {
    const result = await this.raw(
      "SELECT schema_name AS name FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema','performance_schema','mysql','sys') ORDER BY schema_name LIMIT 1000"
    )
    return result.rows.map((row) => ({ database: string(row[0]) }))
  }
  async objects(
    input: DatabaseLocation & {
      search?: string
      page?: number
      pageSize?: number
    }
  ): Promise<DatabaseObjectPage> {
    this.assertLocation(input)
    const page = Math.max(1, Math.min(input.page ?? 1, 10000)),
      pageSize = Math.max(1, Math.min(input.pageSize ?? 100, 1000))
    const namespace = input.database ?? this.initial.database
    if (!namespace) return { items: [], page, pageSize, hasMore: false }
    const result = await this.raw(
      `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = ${this.placeholder(
        1
      )} AND table_name LIKE ${this.placeholder(2)} ORDER BY table_name LIMIT ${pageSize + 1} OFFSET ${
        (page - 1) * pageSize
      }`,
      [namespace, `%${input.search ?? ''}%`],
      pageSize + 1
    )
    return {
      items: result.rows.slice(0, pageSize).map((row) => ({
        database: input.database,
        schema: input.schema,
        engineCatalog: input.engineCatalog,
        name: string(row[0]),
        kind: string(row[1]).includes('VIEW') ? 'view' : 'table'
      })),
      page,
      pageSize,
      hasMore: result.rows.length > pageSize
    }
  }
  async describe(object: DatabaseObjectRef): Promise<DatabaseObjectDetail> {
    const reference = this.ref(object)
    const namespace = object.database ?? this.initial.database ?? ''
    const metadata = await this.raw(
      `SELECT column_name, column_type AS data_type, is_nullable, ordinal_position, column_default, column_comment FROM information_schema.columns WHERE table_schema = ${this.placeholder(
        1
      )} AND table_name = ${this.placeholder(2)} ORDER BY ordinal_position LIMIT 1000`,
      [namespace, object.name]
    )
    const columns: DatabaseColumn[] = metadata.rows.map((row, index) => ({
      id: `c${index}`,
      name: string(cell(metadata, row, 'column_name')),
      dataType: string(cell(metadata, row, 'data_type')),
      nullable: string(cell(metadata, row, 'is_nullable')) === 'YES',
      ordinal: number(cell(metadata, row, 'ordinal_position')),
      comment: string(cell(metadata, row, 'column_comment')) || undefined,
      defaultValue: cell(metadata, row, 'column_default') == null ? null : string(cell(metadata, row, 'column_default'))
    }))
    if (!columns.length) throw new Error('object_not_found_or_denied')
    const keys: DatabaseKey[] = [],
      diagnostics: string[] = []
    let definition = ''
    const source = await this.raw(`SHOW CREATE ${object.kind === 'view' ? 'VIEW' : 'TABLE'} ${reference}`, [], 1)
    definition = string(source.rows[0]?.[1])
    const index = await this.raw(`SHOW INDEX FROM ${reference}`)
    for (const row of index.rows) {
      const name = string(cell(index, row, 'Key_name'))
      let key = keys.find((item) => item.name === name)
      if (!key) {
        key = {
          name,
          kind: name === 'PRIMARY' ? 'primary' : number(cell(index, row, 'Non_unique')) === 0 ? 'unique' : 'index',
          columns: []
        }
        keys.push(key)
      }
      key.columns.push(string(cell(index, row, 'Column_name')))
    }
    const foreign = await this.raw(
      'SELECT constraint_name,column_name,referenced_table_schema,referenced_table_name,referenced_column_name FROM information_schema.key_column_usage WHERE table_schema=? AND table_name=? AND referenced_table_name IS NOT NULL ORDER BY constraint_name,ordinal_position LIMIT 1000',
      [namespace, object.name]
    )
    for (const row of foreign.rows) {
      let key = keys.find((item) => item.name === string(row[0]))
      if (!key) {
        key = {
          name: string(row[0]),
          kind: 'foreign',
          columns: [],
          referencedTable: { database: string(row[2]), name: string(row[3]), kind: 'table' },
          referencedColumns: []
        }
        keys.push(key)
      }
      key.columns.push(string(row[1]))
      key.referencedColumns?.push(string(row[4]))
    }
    const editable =
      object.kind === 'table' &&
      keys.some(
        (key) =>
          (key.kind === 'primary' || key.kind === 'unique') &&
          key.columns.length > 0 &&
          key.columns.every((name) => columns.find((column) => column.name === name)?.nullable === false)
      )
    return { object, columns, keys, definition, editable, diagnostics }
  }
}
