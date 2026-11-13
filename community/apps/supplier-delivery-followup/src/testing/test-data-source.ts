import { DataSource } from 'typeorm'
import { ENTITIES } from '../lib/entities'

export function testPostgresUrl() {
  const value = process.env.SUPPLIER_DELIVERY_TEST_PG_URL
  if (!value) return undefined
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('SUPPLIER_DELIVERY_TEST_PG_URL must be a valid PostgreSQL URL.')
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !decodeURIComponent(url.pathname.slice(1)).toLowerCase().includes('test')
  ) {
    throw new Error('SUPPLIER_DELIVERY_TEST_PG_URL database name must contain "test"; refusing to drop schema.')
  }
  return value
}

/** Test-only: each test starts clean; reconnects explicitly preserve the existing schema/data. */
export function createTestDataSource(options: { reconnect?: boolean; database?: Uint8Array } = {}) {
  const url = testPostgresUrl()
  return url
    ? new DataSource({
        type: 'postgres',
        url,
        entities: ENTITIES,
        synchronize: !options.reconnect,
        dropSchema: !options.reconnect
      })
    : new DataSource({
        type: 'sqljs',
        entities: ENTITIES,
        synchronize: !options.reconnect,
        ...(options.database ? { database: options.database } : {})
      })
}

export async function reconnectTestDataSource(db: DataSource) {
  const database = db.options.type === 'sqljs' ? (db.driver as unknown as { export(): Uint8Array }).export() : undefined
  await db.destroy()
  return createTestDataSource({ reconnect: true, database }).initialize()
}
