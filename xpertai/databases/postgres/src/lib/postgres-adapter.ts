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
const number = (value: DatabaseValue | undefined) => Number(value ?? 0)
const string = (value: DatabaseValue | undefined) => (value == null ? '' : String(value))
const cell = (result: DatabaseResult, row: DatabaseValue[], name: string) =>
  row[result.columns.findIndex((column) => column.name.toLowerCase() === name.toLowerCase())]
export class PostgresWorkbenchAdapter extends SqlWorkbenchAdapter {
  readonly engine = 'postgres'
  protected readonly supportsTransactions = true
  private version?: string
  protected readonly readTransactionStatement = 'BEGIN READ ONLY'
  protected readonly explainStatement = 'EXPLAIN (FORMAT JSON) '
  protected placeholder(index: number) {
    return `$${index}`
  }
  protected paginate(sql: string, parameters: DatabaseValue[] | undefined, limit: number, offset: number) {
    return {
      sql: `SELECT * FROM (\n${sql}\n) AS ${this.quote('_db_studio_page')} LIMIT ${limit + 1} OFFSET ${offset}`,
      parameters
    }
  }
  protected quote(name: string) {
    return quoteSqlIdentifier(name, '"')
  }
  protected ref(object: DatabaseObjectRef) {
    this.assertLocation(object)
    const namespace = object.schema ?? this.initial.schema ?? 'public'
    if (!namespace) throw new Error('database_required')
    return `${this.quote(namespace)}.${this.quote(object.name)}`
  }
  protected assertLocation(location: DatabaseLocation) {
    if (location.engineCatalog && location.engineCatalog !== 'internal')
      throw new Error('external_catalog_not_supported')
    if (location.database && location.database !== this.initial.database)
      throw new Error('database_requires_new_connection')
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
      "SELECT schema_name AS name FROM information_schema.schemata WHERE schema_name NOT LIKE 'pg_%' AND schema_name <> 'information_schema' ORDER BY schema_name LIMIT 1000"
    )
    return result.rows.map((row) => ({ database: this.initial.database, schema: string(row[0]) }))
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
    const namespace = input.schema ?? this.initial.schema ?? 'public'
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
    const namespace = object.schema ?? this.initial.schema ?? 'public'
    const metadata = await this.raw(
      `SELECT a.attname AS column_name, pg_catalog.format_type(a.atttypid,a.atttypmod) AS data_type, CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END AS is_nullable, a.attnum AS ordinal_position, pg_get_expr(d.adbin,d.adrelid) AS column_default, pg_catalog.col_description(c.oid,a.attnum) AS column_comment FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname=$1 AND c.relname=$2 AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum LIMIT 1000`,
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
    const result = await this.raw(
      `SELECT tc.constraint_name, tc.constraint_type, kcu.column_name, kcu.ordinal_position, ccu.table_schema AS foreign_schema, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_catalog=kcu.constraint_catalog AND tc.constraint_schema=kcu.constraint_schema AND tc.constraint_name=kcu.constraint_name LEFT JOIN information_schema.referential_constraints rc ON rc.constraint_catalog=tc.constraint_catalog AND rc.constraint_schema=tc.constraint_schema AND rc.constraint_name=tc.constraint_name LEFT JOIN information_schema.key_column_usage ccu ON ccu.constraint_catalog=rc.unique_constraint_catalog AND ccu.constraint_schema=rc.unique_constraint_schema AND ccu.constraint_name=rc.unique_constraint_name AND ccu.ordinal_position=kcu.position_in_unique_constraint WHERE tc.table_schema=$1 AND tc.table_name=$2 ORDER BY tc.constraint_name,kcu.ordinal_position LIMIT 1000`,
      [namespace, object.name]
    )
    for (const row of result.rows) {
      const name = string(cell(result, row, 'constraint_name')),
        kind = string(cell(result, row, 'constraint_type'))
      let key = keys.find((item) => item.name === name)
      if (!key) {
        key = {
          name,
          kind: kind === 'PRIMARY KEY' ? 'primary' : kind === 'FOREIGN KEY' ? 'foreign' : 'unique',
          columns: []
        }
        keys.push(key)
      }
      key.columns.push(string(cell(result, row, 'column_name')))
      if (key.kind === 'foreign') {
        key.referencedTable = {
          schema: string(cell(result, row, 'foreign_schema')),
          name: string(cell(result, row, 'foreign_table')),
          kind: 'table'
        }
        ;(key.referencedColumns ??= []).push(string(cell(result, row, 'foreign_column')))
      }
    }
    if (object.kind === 'view') {
      const source = await this.raw('SELECT pg_get_viewdef($1::regclass, true) AS definition', [reference], 1)
      definition = `CREATE VIEW ${reference} AS\n${string(source.rows[0]?.[0])}`
    } else {
      definition = `CREATE TABLE ${reference} (\n${columns
        .map(
          (column) =>
            `  ${this.quote(column.name)} ${column.dataType}${column.nullable ? '' : ' NOT NULL'}${
              column.defaultValue === null ? '' : ` DEFAULT ${column.defaultValue}`
            }`
        )
        .join(',\n')}\n);`
      diagnostics.push('definition_reconstructed_from_metadata')
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
