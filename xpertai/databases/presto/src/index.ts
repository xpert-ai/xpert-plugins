import { readFileSync } from 'node:fs'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { PrestoPlugin } from './lib/presto.module.js'
import { PRESTO_ICON } from './lib/presto.types.js'

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
    throw new Error('Invalid Presto plugin package metadata')
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
      value: PRESTO_ICON
    },
    displayName: 'Presto Data Source',
    description:
      'Provide Presto connectivity, query execution, and schema discovery',
    keywords: ['presto', 'database', 'datasource', 'sql', 'federation'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema
  },
  register(ctx) {
    ctx.logger.log('Registering Presto data source plugin')
    return {
      module: PrestoPlugin,
      global: true
    }
  },
  async onStart(ctx) {
    ctx.logger.log('Presto data source plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('Presto data source plugin stopped')
  }
}

export {
  PRESTO_TYPE,
  PrestoQueryRunner,
  createPrestoConfigurationSchema
} from './lib/presto.runner.js'
export type {
  PrestoAdapterOptions,
  PrestoClient,
  PrestoClientFactory,
  PrestoClientOptions,
  PrestoEngine,
  PrestoExecutionOptions,
  PrestoResultColumn,
  PrestoRow
} from './lib/presto.runner.js'
export { PrestoPlugin } from './lib/presto.module.js'
export { PrestoDataSourceStrategy } from './lib/presto.strategy.js'
export {
  convertPrestoSchema,
  prestoTypeToColumnType,
  quotePrestoLiteral
} from './lib/presto.types.js'

export default plugin
