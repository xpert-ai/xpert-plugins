import 'reflect-metadata'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { createTestDataSource, testPostgresUrl } from './test-data-source'

const originalUrl = process.env.SUPPLIER_DELIVERY_TEST_PG_URL
afterEach(() => {
  if (originalUrl === undefined) delete process.env.SUPPLIER_DELIVERY_TEST_PG_URL
  else process.env.SUPPLIER_DELIVERY_TEST_PG_URL = originalUrl
})

it.each([
  'postgres://localhost/platform',
  'postgres://localhost/production?database=test',
  'postgres://test@localhost/platform',
  'https://localhost/test',
  'not a URL'
])(
  'supplier-delivery-followup 验收 7: test database guard rejects unsafe URL %s before constructing a DataSource',
  (value) => {
    process.env.SUPPLIER_DELIVERY_TEST_PG_URL = value
    expect(() => createTestDataSource()).toThrow(/SUPPLIER_DELIVERY_TEST_PG_URL/)
  }
)

it('supplier-delivery-followup 验收 7: sql.js default, clean PostgreSQL setup and nondestructive reconnect options', () => {
  delete process.env.SUPPLIER_DELIVERY_TEST_PG_URL
  expect(createTestDataSource().options).toMatchObject({ type: 'sqljs', synchronize: true })
  process.env.SUPPLIER_DELIVERY_TEST_PG_URL = 'postgres://localhost/example_test'
  expect(testPostgresUrl()).toBe(process.env.SUPPLIER_DELIVERY_TEST_PG_URL)
  expect(createTestDataSource().options).toMatchObject({ type: 'postgres', synchronize: true, dropSchema: true })
  expect(createTestDataSource({ reconnect: true }).options).toMatchObject({
    type: 'postgres',
    synchronize: false,
    dropSchema: false
  })
})

it('supplier-delivery-followup 验收 7: test:pg refuses to silently fall back to sql.js when URL is missing', () => {
  const env = { ...process.env }
  delete env.SUPPLIER_DELIVERY_TEST_PG_URL
  let failure: { status?: number; stderr?: string } | undefined
  try {
    execFileSync(process.execPath, [join(__dirname, '../../scripts/test-pg.cjs')], {
      env,
      encoding: 'utf8',
      stdio: 'pipe'
    })
  } catch (error) {
    failure = error as typeof failure
  }
  expect(failure?.status).toBe(1)
  expect(failure?.stderr).toContain('Set SUPPLIER_DELIVERY_TEST_PG_URL')
})
