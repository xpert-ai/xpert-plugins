import { readFileSync } from 'node:fs'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { RedshiftPlugin } from './lib/redshift.module.js'
import { REDSHIFT_ICON } from './lib/redshift.types.js'

const metadata = readMetadata()
const ConfigSchema = z.object({})

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: metadata.name,
    version: metadata.version,
    category: 'database',
    icon: { type: 'svg', value: REDSHIFT_ICON },
    displayName: 'Amazon Redshift Data Source',
    description:
      'Provide Amazon Redshift Data API queries and PostgreSQL-compatible schema discovery',
    keywords: ['aws', 'redshift', 'database', 'datasource', 'sql'],
    author: 'XpertAI Team'
  },
  config: { schema: ConfigSchema },
  register(ctx) {
    ctx.logger.log('Registering Amazon Redshift data source plugin')
    return { module: RedshiftPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('Amazon Redshift data source plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('Amazon Redshift data source plugin stopped')
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
    throw new Error('Invalid Redshift plugin package metadata')
  }
  return { name: value.name, version: value.version }
}

export {
  REDSHIFT_TYPE,
  RedshiftRunner,
  createRedshiftConfigurationSchema
} from './lib/redshift.runner.js'
export type {
  RedshiftAdapterOptions,
  RedshiftDataApi,
  RedshiftDataApiFactory,
  RedshiftDataApiOptions,
  RedshiftDriverColumn,
  RedshiftDriverResult,
  RedshiftRow
} from './lib/redshift.runner.js'
export { RedshiftPlugin } from './lib/redshift.module.js'
export { RedshiftDataSourceStrategy } from './lib/redshift.strategy.js'

export default plugin
