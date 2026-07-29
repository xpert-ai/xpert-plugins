import { readFileSync } from 'node:fs'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { OpenGaussPlugin } from './lib/opengauss.module.js'
import { OPENGAUSS_ICON } from './lib/opengauss.types.js'

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
    throw new Error('Invalid OpenGauss plugin package metadata')
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
    icon: { type: 'svg', value: OPENGAUSS_ICON },
    displayName: 'OpenGauss Data Source',
    description:
      'Provide OpenGauss connectivity through the PostgreSQL-compatible runner',
    keywords: ['opengauss', 'gaussdb', 'database', 'datasource', 'sql'],
    author: 'XpertAI Team'
  },
  config: { schema: ConfigSchema },
  register(ctx) {
    ctx.logger.log('Registering OpenGauss data source plugin')
    return { module: OpenGaussPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('OpenGauss data source plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('OpenGauss data source plugin stopped')
  }
}

export {
  OPENGAUSS_TYPE,
  OpenGaussRunner
} from './lib/opengauss.runner.js'
export type { OpenGaussAdapterOptions } from './lib/opengauss.runner.js'
export { OpenGaussPlugin } from './lib/opengauss.module.js'
export { OpenGaussDataSourceStrategy } from './lib/opengauss.strategy.js'

export default plugin
