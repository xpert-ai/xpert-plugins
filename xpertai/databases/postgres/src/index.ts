import { readFileSync } from 'node:fs'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { PostgresPlugin } from './lib/postgres.module.js'
import { POSTGRES_ICON } from './lib/postgres.types.js'

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
    throw new Error('Invalid PostgreSQL plugin package metadata')
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
      value: POSTGRES_ICON
    },
    displayName: 'PostgreSQL Data Source',
    description:
      'Provide PostgreSQL connectivity, schema discovery, table management, and streaming CSV import',
    keywords: ['postgresql', 'postgres', 'database', 'datasource', 'sql'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema
  },
  register(ctx) {
    ctx.logger.log('Registering PostgreSQL data source plugin')
    return {
      module: PostgresPlugin,
      global: true
    }
  },
  async onStart(ctx) {
    ctx.logger.log('PostgreSQL data source plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('PostgreSQL data source plugin stopped')
  }
}

export {
  POSTGRES_TYPE,
  createPostgresConfigurationSchema,
  PostgresOperationError,
  PostgresRunner
} from './lib/postgres.runner.js'
export type {
  PostgresAdapterOptions,
  PostgresClient,
  PostgresClientFactory,
  PostgresDriverField,
  PostgresDriverResult
} from './lib/postgres.runner.js'
export { PostgresPlugin } from './lib/postgres.module.js'
export { PostgresDataSourceStrategy } from './lib/postgres.strategy.js'
export {
  convertPostgresSchema,
  formatPostgresDefaultValue,
  getPostgresSchemaQuery,
  postgresDatabaseTypeToApplicationType,
  postgresTypeToColumnType,
  qualifyPostgresTable,
  quotePostgresIdentifier,
  quotePostgresLiteral,
  typeToPostgres
} from './lib/postgres.types.js'
export type { PostgresRow } from './lib/postgres.types.js'

export default plugin
