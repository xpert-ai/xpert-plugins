import { readFileSync } from 'node:fs'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { MssqlPlugin } from './lib/mssql.module.js'
import { MSSQL_ICON } from './lib/mssql.types.js'

const metadata = readMetadata()
const ConfigSchema = z.object({})

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: metadata.name,
    version: metadata.version,
    category: 'database',
    icon: { type: 'svg', value: MSSQL_ICON },
    displayName: 'Microsoft SQL Server Data Source',
    description:
      'Provide Microsoft SQL Server connectivity, schema discovery, and data import',
    keywords: ['mssql', 'sql-server', 'database', 'datasource', 'sql'],
    author: 'XpertAI Team'
  },
  config: { schema: ConfigSchema },
  register(ctx) {
    ctx.logger.log('Registering Microsoft SQL Server data source plugin')
    return { module: MssqlPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('Microsoft SQL Server data source plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('Microsoft SQL Server data source plugin stopped')
  }
}

function readMetadata(): { name: string; version: string } {
  const value: unknown = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  )
  if (
    typeof value !== 'object' ||
    value === null ||
    !('name' in value) ||
    typeof value.name !== 'string' ||
    !('version' in value) ||
    typeof value.version !== 'string'
  ) {
    throw new Error('Invalid MSSQL plugin package metadata')
  }
  return { name: value.name, version: value.version }
}

export {
  MSSQL_TYPE,
  MssqlImportError,
  MssqlRunner,
  createMssqlConfigurationSchema
} from './lib/mssql.runner.js'
export type {
  MssqlAdapterOptions,
  MssqlClient,
  MssqlClientFactory,
  MssqlClientOptions,
  MssqlDriverResult,
  MssqlRow
} from './lib/mssql.runner.js'
export { MssqlPlugin } from './lib/mssql.module.js'
export { MssqlDataSourceStrategy } from './lib/mssql.strategy.js'
export { typeToMssql } from './lib/mssql.types.js'

export default plugin
