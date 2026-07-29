import { readFileSync } from 'node:fs'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { HivePlugin } from './lib/hive.module.js'
import { HIVE_ICON } from './lib/hive.types.js'

const metadata = readMetadata()
const ConfigSchema = z.object({})

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: metadata.name,
    version: metadata.version,
    category: 'database',
    icon: { type: 'svg', value: HIVE_ICON },
    displayName: 'Apache Hive Data Source',
    description:
      'Provide Apache Hive connectivity, query execution, and metadata discovery',
    keywords: ['hive', 'hadoop', 'database', 'datasource', 'sql'],
    author: 'XpertAI Team'
  },
  config: { schema: ConfigSchema },
  register(ctx) {
    ctx.logger.log('Registering Apache Hive data source plugin')
    return { module: HivePlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('Apache Hive data source plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('Apache Hive data source plugin stopped')
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
    throw new Error('Invalid Hive plugin package metadata')
  }
  return { name: value.name, version: value.version }
}

export {
  HIVE_TYPE,
  HiveQueryRunner,
  createHiveConfigurationSchema
} from './lib/hive.runner.js'
export type {
  HiveAdapterOptions,
  HiveRuntime,
  HiveRuntimeFactory,
  HiveRuntimeResult
} from './lib/hive.runner.js'
export { HivePlugin } from './lib/hive.module.js'
export { HiveDataSourceStrategy } from './lib/hive.strategy.js'
export { hiveTypeToColumnType } from './lib/hive.types.js'

export default plugin
