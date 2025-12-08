import { Connection, ConnectionOptions } from '@sap/hana-client'
import hanaClient from '@sap/hana-client'
import { BaseSQLQueryRunner, CreationTable, DBProtocolEnum, DBSyntaxEnum, IDSSchema, IDSTable, QueryOptions, QueryResult, SQLAdapterOptions } from '@xpert-ai/plugin-sdk'
import { groupBy } from 'lodash-es'
import { HANA } from './types.js'


export interface HANAAdapterOptions extends SQLAdapterOptions {
  database?: string
}

export class HANAAdapter<T extends HANAAdapterOptions = HANAAdapterOptions> extends BaseSQLQueryRunner<T> {
  override readonly name: string = 'HANA'
  override readonly type: string = HANA
  override readonly syntax = DBSyntaxEnum.SQL
  override readonly protocol = DBProtocolEnum.SQL

  override readonly jdbcDriver = 'com.sap.db.jdbc.Driver'

  override jdbcUrl(schema?: string) {
    return `jdbc:sap://${this.options.host}:${this.options.port}/?databaseName=${this.options.database}&currentSchema=${schema}&user=${encodeURIComponent(
      this.options.username as string
    )}&password=${encodeURIComponent(this.options.password as string)}`
  }

  override get configurationSchema() {
    return {
      type: 'object',
      properties: {
        username: { type: 'string' },
        password: { type: 'string' },
        host: { type: 'string' },
        port: { type: 'number', default: null },
        database: { type: 'string', title: 'Database/Tenant' },
        catalog: { type: 'string', title: 'Schema' },
        // schema: { type: 'string', title: 'Schema' },
        encoding: { type: 'string' }
      },
      required: ['username', 'password', 'host', 'port', 'database'],
      order: ['host', 'port', 'username', 'password', 'database', 'catalog'],
      extra_options: ['encoding'],
      secret: ['password']
    }
  }

  private connection: Connection

  constructor(options: T) {
    super(options)

    this.connection = hanaClient.createConnection()
  }

  async connect(options?: QueryOptions): Promise<Connection> {
    const conn_params: ConnectionOptions = {
      serverNode: `${this.options.host}:${this.options.port}`,
      uid: this.options.username,
      pwd: this.options.password,
      currentSchema: options?.catalog,
      databaseName: this.options.database
    }

    return new Promise((resolve, reject) => {
      if (this.connection.state() === 'connected') {
        resolve(this.connection)
      } else {
        this.connection.connect(conn_params, (err) => {
          if (err) {
            return reject(err)
          }
          resolve(this.connection)
        })
      }
    })
  }

  async execute(query: string, options?: QueryOptions): Promise<any[]> {
    await this.connect(options)

    return new Promise((resolve, reject) => {
      this.connection.exec(query, [], (err, result) => {
        if (err) {
          return reject(err)
        }
        this.connection.disconnect()
        resolve(result as any[])
      })
    })
  }

  /**
   * Execute a sql statement in HANA DB
   *
   * @param query sql statement
   * @param options
   * @returns
   */
  async runQuery(query: string, options?: Record<string, unknown>) {
    return this.execute(query, options).then((data: any) => {
      return {
        status: 'OK',
        data
      } as QueryResult
    })
  }

  async getCatalogs(): Promise<IDSSchema[]> {
    return this.execute(`SELECT * FROM "SYS"."SCHEMAS"`).then((data: any) => {
      return data?.map((item) => ({
        ...item,
        schema: item.SCHEMA_NAME,
        name: item.SCHEMA_NAME
      }))
    })
  }

  /**
   * Retrieve tables and views under a specified schema (catalog).
   * If a table or view name is specified, its field information is retrieved.
   * 
   * @param catalog Schema name
   * @param tableName Table or view name
   * @returns 
   */
  override async getSchema(catalog?: string, tableName?: string): Promise<IDSSchema[]> {
    let query = ''

    if (tableName) {
      const tableCondition = `A.TABLE_NAME = '${tableName}'` + (catalog
        ? ` AND A.SCHEMA_NAME = '${catalog}'`
        : '')
      const viewCondition = `A.VIEW_NAME = '${tableName}'` + (catalog
        ? ` AND A.SCHEMA_NAME = '${catalog}'`
        : '')

      // Combine field information from a TABLE and VIEW using UNION ALL.
      query = `
        SELECT 
          'TABLE' AS OBJECT_TYPE,
          A.SCHEMA_NAME, 
          A.TABLE_NAME AS OBJECT_NAME, 
          A.COMMENTS AS OBJECT_LABEL,
          B.COLUMN_NAME,
          B.COMMENTS AS COLUMN_LABEL,
          B.DATA_TYPE_NAME,
          B.LENGTH,
          B.SCALE,
          B.IS_NULLABLE
        FROM "SYS"."TABLES" AS A
        JOIN "SYS"."TABLE_COLUMNS" AS B
          ON A.SCHEMA_NAME = B.SCHEMA_NAME AND A.TABLE_NAME = B.TABLE_NAME
        WHERE ${tableCondition}

        UNION ALL

        SELECT 
          'VIEW' AS OBJECT_TYPE,
          A.SCHEMA_NAME, 
          A.VIEW_NAME AS OBJECT_NAME, 
          A.COMMENTS AS OBJECT_LABEL,
          B.COLUMN_NAME,
          B.COMMENTS AS COLUMN_LABEL,
          B.DATA_TYPE_NAME,
          B.LENGTH,
          B.SCALE,
          B.IS_NULLABLE
        FROM "SYS"."VIEWS" AS A
        JOIN "SYS"."VIEW_COLUMNS" AS B
          ON A.SCHEMA_NAME = B.SCHEMA_NAME AND A.VIEW_NAME = B.VIEW_NAME
        WHERE ${viewCondition}

        ORDER BY SCHEMA_NAME, OBJECT_NAME
      `
    } else {
      // No table name specified, only retrieve table/view list
      query = `
        SELECT 'TABLE' AS OBJECT_TYPE, SCHEMA_NAME, TABLE_NAME AS OBJECT_NAME, COMMENTS AS OBJECT_LABEL
        FROM "SYS"."TABLES"
        ${catalog ? `WHERE SCHEMA_NAME = '${catalog}'` : ''}
        UNION ALL
        SELECT 'VIEW' AS OBJECT_TYPE, SCHEMA_NAME, VIEW_NAME AS OBJECT_NAME, COMMENTS AS OBJECT_LABEL
        FROM "SYS"."VIEWS"
        ${catalog ? `WHERE SCHEMA_NAME = '${catalog}'` : ''}
      `
    }

    const data = await this.execute(query)

    const tables: IDSTable[] = []
    const schemas = groupBy(data, 'SCHEMA_NAME')

    Object.keys(schemas).forEach((database) => {
      const objectGroups = groupBy(schemas[database], 'OBJECT_NAME')
      Object.keys(objectGroups).forEach((name) => {
        const first = objectGroups[name][0]
        tables.push({
          schema: database,
          name,
          label: first.OBJECT_LABEL,
          type: first.OBJECT_TYPE, // ✅ Add: TABLE or VIEW
          columns: objectGroups[name]
            .filter((item) => item.COLUMN_NAME)
            .map((item) => ({
              name: item.COLUMN_NAME,
              label: item.COLUMN_LABEL,
              dataType: concatHANAType(item.DATA_TYPE_NAME, item.LENGTH, item.SCALE),
              type: hanaTypeMap(item.DATA_TYPE_NAME),
              nullable: item.IS_NULLABLE?.toLowerCase() === 'true'
            }))
        } as IDSTable)
      })
    })

    return [
      {
        schema: catalog,
        name: catalog,
        tables
      }
    ]
  }


  /**
   * Create HANA schema (catalog)
   *
   * @param catalog HANA Schema name
   * @param options ownedBy: 'SYSTEM'
   */
  override async createCatalog(
    catalog: string,
    options?: {
      ownedBy: string
    }
  ) {
    const { ownedBy } = options ?? { ownedBy: 'SYSTEM' }
    const schemas = await this.getSchema(catalog)
    if (schemas.length === 0) {
      await this.runQuery(`CREATE SCHEMA ${catalog} OWNED BY ${ownedBy}`)
    }
  }

  override async ping(): Promise<void> {
    await this.runQuery(`SELECT * FROM "DUMMY"`)
  }

  override async import(params: CreationTable, options?: { catalog?: string }): Promise<void> {
    const { name, columns, data, mergeType } = params

    if (!data?.length) {
      throw new Error(`data is empty`)
    }

    const tableName = `"${name}"` // options?.catalog ? `"${options.catalog}"."${name}"` :

    const createTableStatement = `CREATE COLUMN TABLE ${tableName} (${columns
      .map(
        (col) => `"${col.fieldName}" ${typeToHANADB(col.type, col.isKey, col.length)}${col.isKey ? ' PRIMARY KEY' : ''}`
      )
      .join(', ')} )`
    const values = data.map((row) =>
      columns.map(({ name, type, length, isKey }) => {
        const hanaType = typeToHANADB(type, isKey, length) as HANAType
        if (row[name] instanceof Date || isDateType(hanaType)) {
          return formatDateToHANA(row[name], hanaType)
        } else if (type === 'String' || type === 'string') {
          return row[name] == null ? null : `${row[name]}`
        } else {
          return row[name]
        }
      })
    )

    try {
      if (mergeType === 'DELETE') {
        await this.dropTable(name, options)
      }

      await this.execute(createTableStatement, options)

      const conn = await this.connect(options)
      const stmt = conn.prepare(
        `INSERT INTO ${tableName} (${columns.map(({ fieldName }) => `"${fieldName}"`).join(',')}) VALUES(${columns
          .map(() => '?')
          .join(',')})`
      )

      return new Promise((resolve, reject) => {
        stmt.execBatch(values, function (err, rows) {
          if (err) {
            return reject(err)
          }
          resolve(rows)
        })
      })
    } catch (err: any) {
      throw {
        message: err.message,
        stats: {
          statements: [createTableStatement]
        }
      }
    }

    // throw new Error(`Method 'import' of HANA DB adapter not implemented.`)
  }

  /**
   * Drop table if exists
   * @param name Table Name
   * @param options 
   */
  override async dropTable(name: string, options?: QueryOptions): Promise<void> {
    // Check if table exists
    const schemas = await this.getSchema(options.catalog, name)
    if (schemas[0]?.tables?.length > 0) {
      await this.execute(`DROP TABLE "${name}"`, options)
    }
  }

  async teardown() {
    this.connection.disconnect()
  }
}


export function hanaTypeMap(type: string): 'number' | 'string' | 'boolean' | 'object' | 'timestamp' {
  switch (type?.toLowerCase()) {
    case 'decimal':
    case 'numeric':
    case 'int':
    case 'integer':
    case 'float':
    case 'real':
    case 'bigint':
      return 'number'
    case 'uuid':
    case 'nvarchar':
    case 'character varying':
      return 'string'
    case 'timestamp without time zone':
      return 'timestamp'
    case 'json':
      return 'object'
    default:
      return type as 'string'
  }
}

export type HANAType = 'INT' | 'DECIMAL' | 'NVARCHAR' | 'DATE' | 'TIME' | 'TIMESTAMP' | 'BOOLEAN'

function typeToHANADB(type: string, isKey: boolean, length: number) {
  switch (type) {
    case 'number':
    case 'Number':
      return 'INT'
    case 'Numeric':
      return 'DECIMAL'
    case 'string':
    case 'String':
      // Max length 3072 btye for primary key
      if (length !== null && length !== undefined) {
        return isKey ? `NVARCHAR(${Math.min(length, 768)})` : `NVARCHAR(${length})`
      }
      return isKey ? 'NVARCHAR(768)' : 'NVARCHAR(1000)'
    case 'date':
    case 'Date':
      return 'DATE'
    case 'Time':
      return 'TIME'
    case 'Datetime':
    case 'datetime':
      return 'TIMESTAMP'
    case 'boolean':
    case 'Boolean':
      return 'BOOLEAN'
    default:
      return 'NVARCHAR(1000)'
  }
}

function concatHANAType(type: HANAType, length: number, scale: number) {
  if (type === 'DECIMAL') {
    return scale ? `${type}(${length},${scale})` : `${type}(${length})`
  } else if (type === 'NVARCHAR') {
    return `${type}(${length})`
  } else {
    return type
  }
}

function formatDateToHANA(d: Date | string, type: HANAType) {
  const ds = d instanceof Date ? d.toISOString() : d
  switch (type) {
    case 'DATE':
      return ds.slice(0, 10)
    case 'TIME':
      return ds.slice(11, 19)
    case 'TIMESTAMP':
      return ds.slice(0, 10) + ' ' + ds.slice(11, 23)
    default:
      return ds
  }
}

function isDateType(type: HANAType) {
  return ['DATE', 'TIME', 'TIMESTAMP'].includes(type)
}
