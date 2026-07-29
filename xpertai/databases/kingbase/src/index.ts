import { readFileSync } from 'node:fs'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { KingbasePlugin } from './lib/kingbase.module.js'
import { KINGBASE_ICON } from './lib/kingbase.types.js'

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
    throw new Error('Invalid Kingbase plugin package metadata')
  }
  return { name: value.name, version: value.version }
}

const packageMetadata = readPackageMetadata()
const ConfigSchema = z.object({})

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageMetadata.name,
    version: packageMetadata.version,
    category: 'database',
    icon: { type: 'svg', value: KINGBASE_ICON },
    displayName: 'KingbaseES Data Source',
    description:
      'Provide KingbaseES connectivity through the PostgreSQL-compatible runner',
    keywords: ['kingbase', 'kingbasees', 'database', 'datasource', 'sql'],
    author: 'XpertAI Team'
  },
  config: { schema: ConfigSchema },
  register(ctx) {
    ctx.logger.log('Registering KingbaseES data source plugin')
    return { module: KingbasePlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('KingbaseES data source plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('KingbaseES data source plugin stopped')
  }
}

export { KINGBASE_TYPE, KingbaseRunner } from './lib/kingbase.runner.js'
export type { KingbaseAdapterOptions } from './lib/kingbase.runner.js'
export { KingbasePlugin } from './lib/kingbase.module.js'
export { KingbaseDataSourceStrategy } from './lib/kingbase.strategy.js'

export default plugin
