import { MysqlWorkbenchAdapter } from '../src/lib/mysql-adapter.js'
import { DorisMetadataAdapter } from '../src/lib/doris-adapter.js'
import { PostgresWorkbenchAdapter } from '../../postgres/src/lib/postgres-adapter.js'
import type { WorkbenchTransport } from '@xpert-ai/sql-workbench'
import type { DatabaseLocation } from '@xpert-ai/plugin-sdk/data-workbench'
export function createAdapter(
  engine: 'mysql' | 'doris' | 'postgres',
  transport: WorkbenchTransport,
  initial: DatabaseLocation = {}
) {
  const Adapter = { mysql: MysqlWorkbenchAdapter, doris: DorisMetadataAdapter, postgres: PostgresWorkbenchAdapter }[
    engine
  ]
  return new Adapter(transport, initial)
}
