import { readFileSync } from 'node:fs'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { TrinoPlugin } from './lib/trino.module.js'
import { TRINO_ICON } from './lib/trino.types.js'

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
    throw new Error('Invalid Trino plugin package metadata')
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
      value: TRINO_ICON
    },
    displayName: 'Trino Data Source',
    description:
      'Provide Trino connectivity through the shared Presto-compatible runner',
    keywords: ['trino', 'database', 'datasource', 'sql', 'federation'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema
  },
  register(ctx) {
    ctx.logger.log('Registering Trino data source plugin')
    return {
      module: TrinoPlugin,
      global: true
    }
  },
  async onStart(ctx) {
    ctx.logger.log('Trino data source plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('Trino data source plugin stopped')
  }
}

export { TRINO_TYPE, TrinoQueryRunner } from './lib/trino.runner.js'
export type { TrinoAdapterOptions } from './lib/trino.runner.js'
export { TrinoPlugin } from './lib/trino.module.js'
export { TrinoDataSourceStrategy } from './lib/trino.strategy.js'

export default plugin
