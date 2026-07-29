import { readFileSync } from 'node:fs'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { ClickHousePlugin } from './lib/clickhouse.module.js'
import { CLICKHOUSE_ICON } from './lib/clickhouse.types.js'

interface PackageMetadata {
  name: string
  version: string
}

function readPackageMetadata(): PackageMetadata {
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
    throw new Error('Invalid ClickHouse plugin package metadata')
  }

  return {
    name: value.name,
    version: value.version
  }
}

const packageMetadata = readPackageMetadata()
const ConfigSchema = z.object({})

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageMetadata.name,
    version: packageMetadata.version,
    category: 'database',
    icon: {
      type: 'svg',
      value: CLICKHOUSE_ICON
    },
    displayName: 'ClickHouse Data Source',
    description: 'Provide ClickHouse database connectivity, metadata discovery, and data import',
    keywords: ['clickhouse', 'database', 'datasource', 'analytics'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema
  },
  register(ctx) {
    ctx.logger.log('Registering ClickHouse data source plugin')
    return {
      module: ClickHousePlugin,
      global: true
    }
  },
  async onStart(ctx) {
    ctx.logger.log('ClickHouse data source plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('ClickHouse data source plugin stopped')
  }
}

export {
  CLICKHOUSE_TYPE,
  ClickHouseImportError,
  ClickHouseRunner
} from './lib/clickhouse.runner.js'
export type {
  ClickHouseAdapterOptions,
  ClickHouseClient
} from './lib/clickhouse.runner.js'
export { ClickHousePlugin } from './lib/clickhouse.module.js'
export { ClickHouseDataSourceStrategy } from './lib/clickhouse.strategy.js'
export { typeToClickHouse } from './lib/clickhouse.types.js'

export default plugin
