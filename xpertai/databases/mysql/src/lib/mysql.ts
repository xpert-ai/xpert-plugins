import mysql from 'mysql2'
import { Connection, Pool, createConnection, FieldPacket, ConnectionOptions } from 'mysql2'
import { BaseSQLQueryRunner, DBCreateTableMode, DBProtocolEnum, DBSyntaxEnum, DBTableAction, DBTableDataAction, DBTableDataParams, DBTableOperationParams, getErrorMessage, IDSSchema, QueryOptions, SQLAdapterOptions } from '@xpert-ai/plugin-sdk'
import { groupBy, pick } from 'lodash-es'
import { MySQLDataSource } from './types.js'

export const MYSQL_TYPE = MySQLDataSource

export interface MysqlAdapterOptions extends SQLAdapterOptions {
  queryTimeout?: number
  timezone?: string
  serverTimezone?: string
}

const MYSQL_DEFAULT_PORT = 3306

export class MySQLRunner<T extends MysqlAdapterOptions = MysqlAdapterOptions> extends BaseSQLQueryRunner<T> {
  override readonly name: string = 'MySQL'
  override readonly type: string = MYSQL_TYPE
  override readonly syntax = DBSyntaxEnum.SQL
  override readonly protocol = DBProtocolEnum.SQL

  override readonly jdbcDriver: string = 'com.mysql.jdbc.Driver'
  override jdbcUrl(schema?: string) {
    return `jdbc:mysql://${this.options.host}:${this.options.port || MYSQL_DEFAULT_PORT}/${schema}?${this.options.serverTimezone ? `serverTimezone=${this.options.serverTimezone}&` : ''}user=${encodeURIComponent(
      this.options.username as string
    )}&password=${encodeURIComponent(this.options.password as string)}`
  }

  override get configurationSchema() {
    return {
      type: 'object',
      properties: {
        host: { type: 'string' },
        port: { type: 'number', default: MYSQL_DEFAULT_PORT },
        username: { type: 'string', title: 'Username' },
        password: { type: 'string', title: 'Password' },
        // catalog is used to specify the database
        catalog: { type: 'string', title: 'Database' },
        timezone: { type: 'string', title: 'Timezone', default: '+08:00' },
        serverTimezone: { type: 'string', title: 'Server Timezone', default: 'Asia/Shanghai' },
        // database: { type: 'string' },
        // for SSL
        use_ssl: { type: 'boolean', title: 'Use SSL' },
        ssl_cacert: {
          type: 'textarea',
          title: 'CA certificate',
          depend: 'use_ssl'
        },
        ssl_cert: {
          type: 'textarea',
          title: 'Client certificate',
          depend: 'use_ssl'
        },
        ssl_key: {
          type: 'textarea',
          title: 'Client key',
          depend: 'use_ssl'
        },

        queryTimeout: {
          type: 'number',
          title: 'Query timeout',
        }
      },
      order: ['host', 'port', 'username', 'password'],
      required: ['username', 'password'],
      secret: ['password']
    }
  }

  #connection: mysql.Connection | null = null
  protected createConnection(database?: string): Connection {
    const config: ConnectionOptions = pick(this.options, ['host', 'port', 'password', 'database'])
    if (this.options.username) {
      config.user = this.options.username
    }
    if (database) {
      config.database = database
    }

    if (this.options.use_ssl) {
      if (!this.options.ssl_cacert) {
        throw new Error(`No mysql ca cert for ssl connection`)
      }
      config.ssl = {
        ca: this.options.ssl_cacert
      }
    }
    if (this.options.timezone) {
      config.timezone = this.options.timezone
    }

    return createConnection({
      ...config,
      // waitForConnections: true,
      // connectionLimit: 10,
      // maxIdle: 10, // max idle connections, the default value is the same as `connectionLimit`
      // idleTimeout: 60000, // idle connections timeout, in milliseconds, the default value 60000
      // queueLimit: 0,
      debug: this.options.debug,
      trace: this.options.trace,
      charset: 'utf8',
      connectTimeout: 60000
    })
  }

  getConnection(catalog: string): Connection {
    if (!this.#connection) {
      this.#connection = this.createConnection(catalog)
    }

    return this.#connection
  }

  async query(connection: Connection | Pool, statment: string, values?: any) {
    return new Promise((resolve, reject) => {
      const callback = (error, results, fields: FieldPacket[]) => {
        if (error) {
          reject(new Error(getErrorMessage(error)))
          return
        }

        resolve({
          status: 'OK',
          data: results,
          columns: fields?.map((field) => ({
            name: field.name,
            type: MySQLTypeMap[field.columnType],
            dataType: mysql.Types[field.columnType]
          }))
        })
      }

      connection.query(
        {
          sql: statment,
          timeout: this.options.queryTimeout || 60000 * 60, // 1h
          values
        },
        callback
      )
    })
  }

  async runQuery(query: string, options?: QueryOptions): Promise<any> {
    const connection = this.getConnection(options?.catalog ?? this.options.catalog)
    return await this.query(connection, query)
  }

  async getCatalogs(): Promise<IDSSchema[]> {
    const query =
      "SELECT SCHEMA_NAME FROM `information_schema`.`SCHEMATA` WHERE SCHEMA_NAME NOT IN ('information_schema', 'performance_schema', 'mysql', 'sys')"
    const { data } = await this.runQuery(query)
    return data.map((row: any) => ({
      name: row.SCHEMA_NAME
    }))
  }

  async getSchema(catalog?: string, tableName?: string): Promise<IDSSchema[]> {
    let query = ''
    const tableSchema = catalog
      ? `A.\`table_schema\` = '${catalog}'`
      : `A.\`table_schema\` NOT IN ('information_schema', 'performance_schema', 'mysql', 'sys')`
    if (tableName) {
      query =
        'SELECT A.`table_schema` AS `table_schema`, A.`table_name` AS `table_name`, A.`table_type` AS `table_type`, ' +
        'A.`table_comment` AS `table_comment`, C.`column_name` AS `column_name`, C.`data_type` AS `data_type`, ' +
        'C.`column_comment` AS `column_comment` FROM `information_schema`.`tables` AS A join ' +
        '`information_schema`.`columns` AS C ON A.`table_schema` = C.`table_schema` ' +
        'AND A.`table_name` = C.`table_name` WHERE ' +
        tableSchema +
        ` AND A.\`table_name\` = '${tableName}'`
    } else {
      query =
        'SELECT `table_schema` AS `table_schema`, `table_name` AS `table_name`, `table_type` AS `table_type`, ' +
        '`table_comment` AS `table_comment` FROM `information_schema`.`tables` AS A WHERE ' +
        tableSchema
    }

    const { data } = await this.runQuery(query, { catalog })
    return convertMySQLSchema(data)
  }

  override async describe(catalog: string, statement: string) {
    if (!statement) {
      return { columns: [] }
    }

    statement = `${statement} LIMIT 1`
    return await this.runQuery(statement, { catalog })
  }

  async createCatalog(catalog: string) {
    // Use `CREATE DATABASE` to make it compatible with Doris?
    const query = `CREATE DATABASE IF NOT EXISTS \`${catalog}\``
    await this.runQuery(query, { catalog })
  }

  /**
   * Import data into db
   * * Create table if not exist
   *
   * @param params
   * @returns
   */
  override async import(params, options?: { catalog?: string }): Promise<void> {
    const { name, columns, data, append } = params

    const connection = this.getConnection(options?.catalog ?? this.options?.catalog)

    const dropTableStatement = `DROP TABLE IF EXISTS \`${name}\``
    const createTableStatement = `CREATE TABLE IF NOT EXISTS \`${name}\` (${columns
      .map(
        (col) =>
          `\`${col.fieldName}\` ${typeToMySqlDB(
            col.type,
            col.isKey,
            col.length,
            (col as any)?.precision,
            (col as any)?.scale ?? (col as any)?.fraction,
            (col as any)?.enumValues,
            (col as any)?.setValues
          )}${col.isKey ? ' PRIMARY KEY' : ''}`
      )
      .join(', ')})`
    const values = data.map((row) => columns.map(({ name }) => row[name]))
    const insertStatement = `INSERT INTO \`${name}\` (${columns
      .map(({ fieldName }) => `\`${fieldName}\``)
      .join(',')}) VALUES ?`
    try {
      if (!append) {
        await this.query(connection, dropTableStatement)
      }
      await this.query(connection, createTableStatement)
      await this.query(connection, insertStatement, [values])
    } catch (err: any) {
      throw {
        message: err.message,
        stats: {
          statements: [dropTableStatement, createTableStatement, insertStatement]
        }
      }
    } finally {
      connection.end()
    }

    return null
  }

  override async tableOp(
    action: DBTableAction,
    params: DBTableOperationParams,
  ): Promise<any> {
    const schema = params.schema ?? this.options.catalog
    const table = params.table
    const queryOptions = schema ? { catalog: schema } : undefined
    const tableIdentifier = table ? formatTableIdentifier(table, schema) : null

    switch (action) {
      case DBTableAction.LIST_TABLES: {
        if (!schema) {
          throw new Error('schema is required to list tables')
        }
        const statement = `SELECT table_name AS table_name, table_type AS table_type FROM information_schema.tables WHERE table_schema = ${mysql.escape(
          schema
        )} ORDER BY table_name`
        const result = await this.runQuery(statement, queryOptions)
        return result.data
      }
      case DBTableAction.TABLE_EXISTS: {
        if (!table) {
          throw new Error('table is required to check existence')
        }
        return await this.tableExists(schema, table, queryOptions)
      }
      case DBTableAction.CREATE_TABLE: {
        if (!tableIdentifier) {
          throw new Error('table is required to create table')
        }
        if (!params.columns?.length) {
          throw new Error('columns are required to create table')
        }
        const createMode = params.createMode ?? DBCreateTableMode.ERROR
        const exists = await this.tableExists(schema, table, queryOptions)
        if (exists) {
          if (createMode === DBCreateTableMode.ERROR) {
            throw new Error(`Table ${table} already exists`)
          }
          if (createMode === DBCreateTableMode.IGNORE) {
            return { skipped: true }
          }
          // auto upgrade: add missing columns and modify existing columns
          const existingColumns = await this.getTableColumns(schema, table, queryOptions)
          const missingColumns = params.columns.filter((column) => {
            const columnName = resolveRawColumnName(column)
            return columnName && !existingColumns.has(columnName.toLowerCase())
          })
          // Add missing columns
          for (const column of missingColumns) {
            const statement = `ALTER TABLE ${tableIdentifier} ADD COLUMN ${buildColumnDefinition(column)}`
            await this.runQuery(statement, queryOptions)
          }
          // Modify existing columns to match new definitions
          const columnsToModify = params.columns.filter((column) => {
            const columnName = resolveRawColumnName(column)
            return columnName && existingColumns.has(columnName.toLowerCase())
          })
          for (const column of columnsToModify) {
            const statement = `ALTER TABLE ${tableIdentifier} MODIFY COLUMN ${buildColumnDefinition(column)}`
            await this.runQuery(statement, queryOptions)
          }
          return {
            upgraded: missingColumns.map((column) => resolveRawColumnName(column)),
            modified: columnsToModify.map((column) => resolveRawColumnName(column))
          }
        }
        const statement = buildCreateTableStatement(tableIdentifier, params.columns)
        if (createMode === DBCreateTableMode.IGNORE || createMode === DBCreateTableMode.UPGRADE) {
          const sql = statement.replace(/^CREATE TABLE/i, 'CREATE TABLE IF NOT EXISTS')
          return await this.runQuery(sql, queryOptions)
        }
        return await this.runQuery(statement, queryOptions)
      }
      case DBTableAction.DROP_TABLE: {
        if (!tableIdentifier) {
          throw new Error('table is required to drop table')
        }
        const statement = `DROP TABLE IF EXISTS ${tableIdentifier}`
        return await this.runQuery(statement, queryOptions)
      }
      case DBTableAction.RENAME_TABLE: {
        if (!tableIdentifier || !params.newTable) {
          throw new Error('table and newTable are required')
        }
        const target = formatTableIdentifier(params.newTable, schema)
        const statement = `RENAME TABLE ${tableIdentifier} TO ${target}`
        return await this.runQuery(statement, queryOptions)
      }
      case DBTableAction.TRUNCATE_TABLE: {
        if (!tableIdentifier) {
          throw new Error('table is required to truncate table')
        }
        return await this.runQuery(`TRUNCATE TABLE ${tableIdentifier}`, queryOptions)
      }
      case DBTableAction.ADD_COLUMN: {
        if (!tableIdentifier || !params.column) {
          throw new Error('table and column are required to add column')
        }
        const statement = `ALTER TABLE ${tableIdentifier} ADD COLUMN ${buildColumnDefinition(params.column)}`
        return await this.runQuery(statement, queryOptions)
      }
      case DBTableAction.DROP_COLUMN: {
        if (!tableIdentifier || !params.columnName) {
          throw new Error('table and columnName are required to drop column')
        }
        const statement = `ALTER TABLE ${tableIdentifier} DROP COLUMN ${mysql.escapeId(params.columnName)}`
        return await this.runQuery(statement, queryOptions)
      }
      case DBTableAction.MODIFY_COLUMN: {
        if (!tableIdentifier || !params.column) {
          throw new Error('table and column are required to modify column')
        }
        const statement = `ALTER TABLE ${tableIdentifier} MODIFY COLUMN ${buildColumnDefinition(params.column)}`
        return await this.runQuery(statement, queryOptions)
      }
      case DBTableAction.CREATE_INDEX: {
        if (!tableIdentifier || !params.index?.name || !params.index?.columns?.length) {
          throw new Error('index definition is incomplete')
        }
        const unique = params.index.unique ? 'UNIQUE ' : ''
        const indexName = mysql.escapeId(params.index.name)
        const columnSql = params.index.columns.map((column) => mysql.escapeId(column)).join(', ')
        const using = params.index.type ? ` USING ${params.index.type.toUpperCase()}` : ''
        const statement = `CREATE ${unique}INDEX ${indexName}${using} ON ${tableIdentifier} (${columnSql})`
        return await this.runQuery(statement, queryOptions)
      }
      case DBTableAction.DROP_INDEX: {
        if (!tableIdentifier || !params.indexName) {
          throw new Error('indexName is required to drop index')
        }
        const statement = `DROP INDEX ${mysql.escapeId(params.indexName)} ON ${tableIdentifier}`
        return await this.runQuery(statement, queryOptions)
      }
      case DBTableAction.GET_TABLE_INFO: {
        if (!schema || !table) {
          throw new Error('schema and table are required to get table info')
        }
        const schemas = await this.getSchema(schema, table)
        const first = schemas?.[0]
        return first?.tables?.find((item) => item.name === table)
      }
      case DBTableAction.CLONE_TABLE_STRUCTURE: {
        if (!tableIdentifier || !params.newTable) {
          throw new Error('table and newTable are required to clone table structure')
        }
        const target = formatTableIdentifier(params.newTable, schema)
        const statement = `CREATE TABLE ${target} LIKE ${tableIdentifier}`
        return await this.runQuery(statement, queryOptions)
      }
      case DBTableAction.CLONE_TABLE: {
        if (!tableIdentifier || !params.newTable) {
          throw new Error('table and newTable are required to clone table')
        }
        const target = formatTableIdentifier(params.newTable, schema)
        await this.runQuery(`CREATE TABLE ${target} LIKE ${tableIdentifier}`, queryOptions)
        return await this.runQuery(`INSERT INTO ${target} SELECT * FROM ${tableIdentifier}`, queryOptions)
      }
      case DBTableAction.OPTIMIZE_TABLE: {
        if (!tableIdentifier) {
          throw new Error('table is required to optimize table')
        }
        return await this.runQuery(`OPTIMIZE TABLE ${tableIdentifier}`, queryOptions)
      }
      default:
        throw new Error(`Unsupported table operation: ${action}`)
    }
  }

  override async tableDataOp(
    action: DBTableDataAction,
    params: DBTableDataParams,
    options?: QueryOptions
  ) {
    if (!params.table) {
      throw new Error('table is required')
    }
    const schema = params.schema ?? options?.catalog ?? this.options.catalog
    const queryOptions = schema || options ? { ...(options ?? {}), ...(schema ? { catalog: schema } : {}) } : undefined
    const tableIdentifier = formatTableIdentifier(params.table, schema)

    switch (action) {
      case DBTableDataAction.SELECT: {
        const columnNames = resolveColumnNames(params.columns)
        const columnsSql = columnNames.length ? columnNames.map((name) => mysql.escapeId(name)).join(', ') : '*'
        const whereClause = buildWhereClause(params.where)
        const orderClause = params.orderBy ? ` ORDER BY ${params.orderBy}` : ''
        const limitClause =
          typeof params.limit === 'number' && Number.isFinite(params.limit) ? ` LIMIT ${params.limit}` : ''
        const offsetClause =
          typeof params.offset === 'number' && Number.isFinite(params.offset) ? ` OFFSET ${params.offset}` : ''
        const statement = `SELECT ${columnsSql} FROM ${tableIdentifier}${whereClause}${orderClause}${limitClause}${offsetClause}`
        return await this.runQuery(statement, queryOptions)
      }
      case DBTableDataAction.INSERT:
      case DBTableDataAction.BULK_INSERT: {
        const rows = ensureRows(params.values)
        const { statement } = buildInsertStatement(tableIdentifier, rows, resolveColumnNames(params.columns))
        return await this.runQuery(statement, queryOptions)
      }
      case DBTableDataAction.UPDATE: {
        const assignments = buildAssignments(params.set)
        if (!assignments) {
          throw new Error('`set` is required for update action')
        }
        const statement = `UPDATE ${tableIdentifier} SET ${assignments}${buildWhereClause(params.where)}`
        return await this.runQuery(statement, queryOptions)
      }
      case DBTableDataAction.UPSERT: {
        const rows = ensureRows(params.values)
        const { statement, columnNames } = buildInsertStatement(
          tableIdentifier,
          rows,
          resolveColumnNames(params.columns)
        )
        let updateClause = buildAssignments(params.set)
        if (!updateClause) {
          updateClause = columnNames
            .map((name) => `${mysql.escapeId(name)} = VALUES(${mysql.escapeId(name)})`)
            .join(', ')
        }
        const sql = `${statement} ON DUPLICATE KEY UPDATE ${updateClause}`
        return await this.runQuery(sql, queryOptions)
      }
      case DBTableDataAction.DELETE: {
        const statement = `DELETE FROM ${tableIdentifier}${buildWhereClause(params.deleteWhere ?? params.where)}`
        return await this.runQuery(statement, queryOptions)
      }
      default:
        throw new Error(`Unsupported table data action: ${action}`)
    }
  }

  private async tableExists(schema: string | undefined, table: string, options?: QueryOptions) {
    const statement = buildTableExistsQuery(schema, table)
    const result = await this.runQuery(statement, options)
    const row = result.data?.[0]
    const count = row?.cnt ?? row?.COUNT ?? row?.count ?? 0
    return Number(count) > 0
  }

  private async getTableColumns(schema: string | undefined, table: string, options?: QueryOptions) {
    const statement = buildColumnListQuery(schema, table)
    const result = await this.runQuery(statement, options)
    const names = (result.data ?? [])
      .map((item) => item.column_name ?? item.COLUMN_NAME)
      .filter(Boolean)
      .map((name: string) => name.toLowerCase())
    return new Set(names)
  }
  
  async teardown() {
    if (this.#connection) {
      this.#connection.destroy()
      this.#connection = null
    }
  }
}

type TableColumnDefinition = NonNullable<DBTableOperationParams['columns']>[number]
type DataColumnDefinition = NonNullable<DBTableDataParams['columns']>[number]
type ColumnDefinition = TableColumnDefinition | DataColumnDefinition | (TableColumnDefinition & DataColumnDefinition)

function resolveRawColumnName(column?: Partial<ColumnDefinition> | string | null) {
  if (!column) {
    return null
  }
  if (typeof column === 'string') {
    return column
  }
  return column.fieldName ?? column.name ?? null
}

function resolveColumnNames(columns?: Partial<ColumnDefinition>[]) {
  return (columns ?? [])
    .map((column) => resolveRawColumnName(column))
    .filter((name): name is string => !!name)
}

function buildColumnDefinition(column: Partial<ColumnDefinition>) {
  const columnName = resolveRawColumnName(column)
  if (!columnName) {
    throw new Error('Column name is required')
  }
  const dataType =
    (column as any)?.dataType ??
    typeToMySqlDB(
      column.type ?? 'string',
      Boolean(column.isKey),
      column.length ?? (column as any)?.size,
      (column as any)?.precision,
      (column as any)?.scale ?? (column as any)?.fraction, // Support scale or fraction (backward compatible)
      (column as any)?.enumValues,
      (column as any)?.setValues
    )
  const required = column.required ? ' NOT NULL' : ''
  const autoIncrement = (column as any)?.autoIncrement ? ' AUTO_INCREMENT' : ''
  // Add UNIQUE constraint support (non-primary key columns can be UNIQUE)
  const unique = !column.isKey && (column as any)?.unique ? ' UNIQUE' : ''

  // Format default values - do not escape SQL functions
  let defaultValue = ''
  if (!(column as any)?.autoIncrement && (column as any)?.defaultValue !== undefined && (column as any)?.defaultValue !== '') {
    const val = (column as any)?.defaultValue
    // MySQL DATE and TIME types do not support function defaults
    if (column.type !== 'date' && column.type !== 'time') {
      // Check if it is a SQL function (uppercase keywords)
      const sqlFunctions = ['CURRENT_TIMESTAMP', 'NOW()', 'CURDATE()', 'CURTIME()', 'CURRENT_DATE', 'CURRENT_TIME']
      const valStr = String(val)
      if (sqlFunctions.includes(valStr.toUpperCase())) {
        defaultValue = ` DEFAULT ${valStr}`
      } else {
        defaultValue = ` DEFAULT ${mysql.escape(val)}`
      }
    }
  }

  return `${mysql.escapeId(columnName)} ${dataType}${autoIncrement}${required}${unique}${defaultValue}`.trim()
}

function buildCreateTableStatement(tableIdentifier: string, columns: TableColumnDefinition[]) {
  const definitions = columns.map((column) => buildColumnDefinition(column))
  const primaryKeys = columns
    .filter((column) => column.isKey)
    .map((column) => resolveRawColumnName(column))
    .filter((name): name is string => !!name)
  if (primaryKeys.length) {
    definitions.push(`PRIMARY KEY (${primaryKeys.map((name) => mysql.escapeId(name)).join(', ')})`)
  }
  return `CREATE TABLE ${tableIdentifier} (${definitions.join(', ')})`
}

function formatTableIdentifier(table: string, schema?: string | null) {
  if (!table) {
    throw new Error('table is required')
  }
  if (table.includes('.')) {
    return mysql.escapeId(table)
  }
  if (schema) {
    return mysql.escapeId(`${schema}.${table}`)
  }
  return mysql.escapeId(table)
}

function buildWhereClause(where?: Record<string, any> | string) {
  if (!where) {
    return ''
  }
  if (typeof where === 'string') {
    return where.trim() ? ` WHERE ${where}` : ''
  }
  const parts = Object.entries(where)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => {
      if (value === null) {
        return `${mysql.escapeId(key)} IS NULL`
      }
      return `${mysql.escapeId(key)} = ${mysql.escape(value)}`
    })
  return parts.length ? ` WHERE ${parts.join(' AND ')}` : ''
}

function buildAssignments(values?: Record<string, any>) {
  if (!values) {
    return ''
  }
  const parts = Object.entries(values)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => {
      if (value === null) {
        return `${mysql.escapeId(key)} = NULL`
      }
      return `${mysql.escapeId(key)} = ${mysql.escape(value)}`
    })
  return parts.join(', ')
}

function ensureRows(values?: Record<string, any> | Array<Record<string, any>>) {
  if (!values) {
    throw new Error('values are required')
  }
  return Array.isArray(values) ? values : [values]
}

function buildInsertStatement(
  tableIdentifier: string,
  rows: Array<Record<string, any>>,
  columns?: string[]
) {
  if (!rows.length) {
    throw new Error('values are required')
  }
  const columnNames = columns && columns.length ? columns : Object.keys(rows[0] ?? {})
  if (!columnNames.length) {
    throw new Error('columns are required for insert')
  }
  const columnSql = columnNames.map((name) => mysql.escapeId(name)).join(', ')
  const valuesSql = rows
    .map((row) => `(${columnNames.map((name) => mysql.escape(row[name] ?? null)).join(', ')})`)
    .join(', ')
  const statement = `INSERT INTO ${tableIdentifier} (${columnSql}) VALUES ${valuesSql}`
  return {
    statement,
    columnNames
  }
}

function buildTableExistsQuery(schema: string | undefined, table: string) {
  const conditions = [`table_name = ${mysql.escape(table)}`]
  if (schema) {
    conditions.push(`table_schema = ${mysql.escape(schema)}`)
  }
  return `SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE ${conditions.join(' AND ')}`
}

function buildColumnListQuery(schema: string | undefined, table: string) {
  const conditions = [`table_name = ${mysql.escape(table)}`]
  if (schema) {
    conditions.push(`table_schema = ${mysql.escape(schema)}`)
  }
  return `SELECT COLUMN_NAME AS column_name FROM information_schema.columns WHERE ${conditions.join(' AND ')}`
}

export function convertMySQLSchema(data: Array<any>) {
  const schemas = groupBy(data, 'table_schema')
  return Object.keys(schemas).map((schema) => {
    const tableGroup = groupBy(schemas[schema], 'table_name')
    const tables = Object.keys(tableGroup).map((name) => {
      return {
        schema,
        name,
        label: tableGroup[name][0].table_comment,
        type: tableGroup[name][0].table_type,
        columns: tableGroup[name]
          .filter((item) => !!item.column_name)
          .map((item) => ({
            name: item.column_name,
            dataType: item.data_type,
            type: pgTypeMap(item.data_type),
            label: item.column_comment
          }))
      }
    })

    return {
      schema,
      name: schema,
      tables
    }
  })
}


/**
 * Convert type to MySQL data type
 * @param type - Data type
 * @param isKey - Whether it is a primary key
 * @param length - Length
 * @param precision - Precision for DECIMAL
 * @param scale - Scale for DECIMAL
 * @param enumValues - Values for ENUM
 * @param setValues - Values for SET
 * @returns MySQL data type string
 */
export function typeToMySqlDB(
  type: string,
  isKey: boolean,
  length: number,
  precision?: number,
  scale?: number,
  enumValues?: string[],
  setValues?: string[]
): string {
  const lowerType = type?.toLowerCase()

  switch (lowerType) {
    // Numeric types - integers
    case 'tinyint':
      return 'TINYINT'
    case 'smallint':
      return 'SMALLINT'
    case 'mediumint':
      return 'MEDIUMINT'
    case 'number':
    case 'int':
    case 'integer':
      return 'INT'
    case 'bigint':
      return 'BIGINT'

    // Numeric types - floating point
    case 'float':
      return 'FLOAT'
    case 'double':
      return 'DOUBLE'
    case 'decimal':
    case 'numeric':
      return `DECIMAL(${precision || 10}, ${scale || 2})`

    // String types - fixed/variable length
    case 'char':
      return length ? `CHAR(${length})` : 'CHAR(255)'
    case 'string':
    case 'varchar':
      // Max length 3072 bytes for primary key
      if (length !== null && length !== undefined) {
        return isKey ? `VARCHAR(${Math.min(length, 768)})` : `VARCHAR(${length})`
      }
      return isKey ? 'VARCHAR(768)' : 'VARCHAR(200)'

    // String types - text
    case 'tinytext':
      return 'TINYTEXT'
    case 'text':
      return 'TEXT'
    case 'mediumtext':
      return 'MEDIUMTEXT'
    case 'longtext':
      return 'LONGTEXT'

    // String types - binary
    case 'tinyblob':
      return 'TINYBLOB'
    case 'blob':
      return 'BLOB'
    case 'mediumblob':
      return 'MEDIUMBLOB'
    case 'longblob':
      return 'LONGBLOB'

    // String types - special
    case 'enum':
      if (!enumValues || enumValues.length === 0) {
        throw new Error('ENUM type requires at least one enum value')
      }
      // Escape single quotes by replacing ' with ''
      const enumValuesStr = enumValues.map((v) => `'${String(v).replace(/'/g, "''")}'`).join(',')
      return `ENUM(${enumValuesStr})`
    case 'set':
      if (!setValues || setValues.length === 0) {
        throw new Error('SET type requires at least one set value')
      }
      // Escape single quotes by replacing ' with ''
      const setValuesStr = setValues.map((v) => `'${String(v).replace(/'/g, "''")}'`).join(',')
      return `SET(${setValuesStr})`

    // Date and time types
    case 'date':
      return 'DATE'
    case 'time':
      return 'TIME'
    case 'datetime':
      return 'DATETIME'
    case 'timestamp':
      return 'TIMESTAMP'
    case 'year':
      return 'YEAR'

    // JSON type
    case 'object':
    case 'json':
      return 'JSON'

    // Spatial types
    case 'geometry':
      return 'GEOMETRY'
    case 'point':
      return 'POINT'
    case 'linestring':
      return 'LINESTRING'
    case 'polygon':
      return 'POLYGON'
    case 'multipoint':
      return 'MULTIPOINT'
    case 'multilinestring':
      return 'MULTILINESTRING'
    case 'multipolygon':
      return 'MULTIPOLYGON'
    case 'geometrycollection':
      return 'GEOMETRYCOLLECTION'

    // Other types
    case 'boolean':
    case 'bool':
      return 'TINYINT(1)'
    case 'uuid':
      return 'VARCHAR(36)' // MySQL has no native UUID type

    default:
      return 'VARCHAR(200)'
  }
}

export function pgTypeMap(type: string): 'string' | 'number' | 'timestamp' | 'object' {
  switch (type) {
    case 'numeric':
    case 'int':
    case 'int 4':
    case 'int4':
    case 'int 8':
    case 'int8':
    case 'integer':
    case 'float':
    case 'float 8':
    case 'float8':
    case 'double':
    case 'real':
    case 'bigint':
    case 'smallint':
    case 'double precision':
    case 'decimal':
      return 'number'
    case 'uuid':
    case 'varchar':
    case 'character varying':
    case 'longtext':
    case 'text':
      return 'string'
    case 'timestamp without time zone':
      return 'timestamp'
    case 'json':
      return 'object'
    default:
      return type as 'string'
  }
}

export const MySQLTypeMap = {
  0x01: 'number',
  0x02: 'number',
  0x03: 'number',
  0x04: 'number',
  0x05: 'number',
  0x06: 'null',
  0x07: 'Date',
  0x08: 'number', // Or 'BigInt'
  0x09: 'number',
  0x0a: 'Date',
  0x0b: 'string',
  0x0c: 'Date',
  0x0d: 'number',
  0xfd: 'string',
  0xfe: 'string',
  0xfc: 'Buffer'
}
