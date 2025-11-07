import 'dotenv/config';
import { HANAAdapter } from './hana.js'

jest.setTimeout(60000)

const connectionOptions = {
  host: process.env.HANA_HOST || '',
  port: Number(process.env.HANA_PORT) || 39041,
  username: process.env.HANA_USERNAME || '',
  password: process.env.HANA_PASSWORD || '',
  database: process.env.HANA_DATABASE || ''
}

describe('HANAAdapter (integration)', () => {
  let adapter: HANAAdapter

  beforeAll(() => {
    adapter = new HANAAdapter(connectionOptions as any)
  })

  afterAll(async () => {
    await adapter.teardown()
  })

  it('establishes a connection to the HANA instance', async () => {
    const connection = await adapter.connect()
    expect(connection).toBeDefined()
    expect(connection.state()).toBe('connected')
    connection.disconnect()
  })

  it('executes a simple query against DUMMY table', async () => {
    const result = await adapter.runQuery(`SELECT * FROM "DUMMY"`)
    console.log(result)
    expect(result.status).toBe('OK')
    expect(Array.isArray(result.data)).toBe(true)
    expect(result.data.length).toBeGreaterThan(0)
  })

  it('retrieves catalogs from the server', async () => {
    const catalogs = await adapter.getCatalogs()
    console.log(catalogs)
    expect(Array.isArray(catalogs)).toBe(true)
    expect(catalogs.length).toBeGreaterThan(0)
    expect(catalogs[0]).toHaveProperty('schema')
    expect(catalogs[0]).toHaveProperty('name')
  })

  it('retrieves schema information for a specific catalog', async () => {
    // Use a known catalog/schema from your HANA instance, or pick the first from getCatalogs
    const catalogs = await adapter.getCatalogs()
    const catalogName = catalogs[0]?.schema
    console.log(`Using catalog/schema: ${catalogName}`)
    const schemas = await adapter.getSchema(catalogName)
    console.log(`Number of tables in schema ${catalogName}: ${schemas[0].tables.length}`)
    console.log(`Top 10 tables:`, schemas[0].tables.slice(0, 10))
    expect(Array.isArray(schemas)).toBe(true)
    expect(schemas.length).toBeGreaterThan(0)
    expect(schemas[0]).toHaveProperty('schema', catalogName)
    expect(schemas[0]).toHaveProperty('tables')
    expect(Array.isArray(schemas[0].tables)).toBe(true)
  })

  it('retrieves schema information for a specific table', async () => {
    // Get a catalog and table name from the first schema
    const catalogs = await adapter.getCatalogs()
    const catalogName = catalogs[0]?.schema
    const schemas = await adapter.getSchema(catalogName)
    const tableName = schemas[0]?.tables?.[0]?.name

    if (tableName) {
      console.log(`Using table: ${tableName} in catalog/schema: ${catalogName}`)
      const tableSchemas = await adapter.getSchema(catalogName, tableName)
      console.log(`Table schema for ${tableName}:`, tableSchemas[0])
      expect(Array.isArray(tableSchemas)).toBe(true)
      expect(tableSchemas[0]).toHaveProperty('tables')
      expect(tableSchemas[0].tables[0]).toHaveProperty('name', tableName)
      expect(Array.isArray(tableSchemas[0].tables[0].columns)).toBe(true)
    } else {
      // If no table found, skip test
      console.warn('No table found in catalog for getSchema(tableName) test')
    }
  })
})
