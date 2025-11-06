import { BaseSQLQueryRunner } from '@xpert-ai/plugin-sdk'
import { MySQLRunner } from './mysql.js'


describe('MySQL QueryRunner', () => {
  let runner: BaseSQLQueryRunner

  beforeEach(() => {
    runner = new MySQLRunner({
      host: '120.55.183.226',
      port: 3306,
      username: 'root',
      password: 'example',
      // database: 'foodmart',
      use_ssl: false,
      ssl_cacert: ``
    })
  })

  afterEach(async () => {
    await runner.teardown()
  })

  it('#getCatalogs', async () => {
    const result = await runner.getCatalogs()
    console.log(result)
  })

  it('#getSchema', async () => {
    const schema = await runner.getSchema('foodmart', 'topSubscribed')
    console.log(JSON.stringify(schema))
  })

  it('#describe', async () => {
    const result = await runner.describe('foodmart', 'SELECT * FROM topSubscribed')
    console.log(result)
  })

  it('#import', async () => {
    await runner.import({}, {catalog: 'foodmart'})

    const result = await runner.runQuery(`SELECT * FROM topSubscribed`, {catalog: 'foodmart'})
    expect(result.data.length).toEqual(15)
  })
})
