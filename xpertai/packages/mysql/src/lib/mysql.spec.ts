import 'dotenv/config'
import { BaseSQLQueryRunner, DBTableAction, DBTableDataAction } from '@xpert-ai/plugin-sdk'
import { MySQLRunner } from './mysql.js'

const requiredEnvVars = ['MYSQL_HOST', 'MYSQL_USERNAME', 'MYSQL_PASSWORD', 'MYSQL_DATABASE'] as const
const missingEnvVars = requiredEnvVars.filter((key) => !process.env[key])

if (missingEnvVars.length) {
  // eslint-disable-next-line no-console
  console.warn(
    `[MySQLRunner Spec] missing environment variables: ${missingEnvVars.join(', ')}. Integration tests will be skipped.`
  )
}

const mysqlRunnerOptions = missingEnvVars.length
  ? null
  : {
      host: process.env.MYSQL_HOST as string,
      port: Number(process.env.MYSQL_PORT ?? 3306),
      username: process.env.MYSQL_USERNAME as string,
      password: process.env.MYSQL_PASSWORD as string,
      catalog: process.env.MYSQL_DATABASE as string,
      use_ssl: process.env.MYSQL_USE_SSL === 'true',
      ssl_cacert: process.env.MYSQL_SSL_CACERT
    }

const describeIntegration = missingEnvVars.length ? describe.skip : describe

describeIntegration('MySQLRunner integration (real database)', () => {
  if (!mysqlRunnerOptions) {
    throw new Error('MySQL test configuration is missing')
  }

  let runner: BaseSQLQueryRunner
  const schema = mysqlRunnerOptions.catalog
  const testTable = `mysql_runner_test_${Date.now()}`
  const clonedTable = `${testTable}_clone`

  beforeAll(async () => {
    runner = new MySQLRunner(mysqlRunnerOptions)
    await runner.runQuery(`DROP TABLE IF EXISTS \`${testTable}\``)
    await runner.runQuery(`DROP TABLE IF EXISTS \`${clonedTable}\``)
  })

  afterAll(async () => {
    await runner.runQuery(`DROP TABLE IF EXISTS \`${clonedTable}\``).catch(() => undefined)
    await runner.runQuery(`DROP TABLE IF EXISTS \`${testTable}\``).catch(() => undefined)
    await runner.teardown()
  })

  it('manages tables and data using tableOp/tableDataOp', async () => {
    const columns = [
      { name: 'id', fieldName: 'id', type: 'number', isKey: true, required: true },
      { name: 'name', fieldName: 'name', type: 'string', isKey: false },
      { name: 'age', fieldName: 'age', type: 'number', isKey: false }
    ]

    await runner.tableOp(DBTableAction.CREATE_TABLE, {
      schema,
      table: testTable,
      columns
    })

    expect(
      await runner.tableOp(DBTableAction.TABLE_EXISTS, {
        schema,
        table: testTable
      })
    ).toBe(true)

    const tableInfo = await runner.tableOp(DBTableAction.GET_TABLE_INFO, {
      schema,
      table: testTable
    })
    expect(tableInfo?.columns?.some((column) => column.name === 'name')).toBe(true)

    await runner.tableDataOp(DBTableDataAction.INSERT, {
      schema,
      table: testTable,
      columns,
      values: { id: 1, name: 'Alice', age: 32 }
    })
    await runner.tableDataOp(DBTableDataAction.BULK_INSERT, {
      schema,
      table: testTable,
      columns,
      values: [
        { id: 2, name: 'Bob', age: 28 },
        { id: 3, name: 'Carol', age: 41 }
      ]
    })

    const inserted = await runner.tableDataOp(DBTableDataAction.SELECT, {
      schema,
      table: testTable,
      orderBy: '`id` ASC'
    })
    expect(inserted.data).toHaveLength(3)

    await runner.tableDataOp(DBTableDataAction.UPDATE, {
      schema,
      table: testTable,
      set: { age: 29 },
      where: { id: 2 }
    })

    const afterUpdate = await runner.tableDataOp(DBTableDataAction.SELECT, {
      schema,
      table: testTable,
      where: { id: 2 }
    })
    expect(afterUpdate.data[0].age).toEqual(29)

    await runner.tableDataOp(DBTableDataAction.UPSERT, {
      schema,
      table: testTable,
      columns,
      values: { id: 1, name: 'Alice', age: 45 }
    })
    const afterUpsert = await runner.tableDataOp(DBTableDataAction.SELECT, {
      schema,
      table: testTable,
      where: { id: 1 }
    })
    expect(afterUpsert.data[0].age).toEqual(45)

    await runner.tableDataOp(DBTableDataAction.DELETE, {
      schema,
      table: testTable,
      deleteWhere: { id: 3 }
    })
    const remainingRows = await runner.tableDataOp(DBTableDataAction.SELECT, {
      schema,
      table: testTable,
      orderBy: '`id` ASC'
    })
    expect(remainingRows.data).toHaveLength(2)

    await runner.tableOp(DBTableAction.CLONE_TABLE, {
      schema,
      table: testTable,
      newTable: clonedTable
    })
    const clonedRows = await runner.tableDataOp(DBTableDataAction.SELECT, {
      schema,
      table: clonedTable
    })
    expect(clonedRows.data).toHaveLength(2)

    await runner.tableOp(DBTableAction.DROP_TABLE, {
      schema,
      table: clonedTable
    })
    
    expect(
      await runner.tableOp(DBTableAction.TABLE_EXISTS, {
        schema,
        table: clonedTable
      })
    ).toBe(false)
  })
})
