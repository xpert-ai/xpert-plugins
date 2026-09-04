import { readFileSync } from 'node:fs'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { SapBwPlugin } from './lib/sap-bw.module.js'
import { SAP_BW_ICON } from './lib/sap-bw.types.js'

interface PackageMetadata {
  name: string
  version: string
}

function readPackageMetadata(): PackageMetadata {
  const value: unknown = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  if (
    typeof value !== 'object' ||
    value === null ||
    !('name' in value) ||
    typeof value.name !== 'string' ||
    !('version' in value) ||
    typeof value.version !== 'string'
  ) {
    throw new Error('Invalid SAP BW plugin package metadata')
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
    level: 'organization',
    category: 'database',
    icon: {
      type: 'svg',
      value: SAP_BW_ICON
    },
    displayName: 'SAP BW Data Source',
    description: 'Discover and query SAP BW cubes and variables through the XMLA protocol',
    keywords: ['sap', 'sap-bw', 'xmla', 'olap', 'mdx'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema
  },
  register(ctx) {
    ctx.logger.log('Registering SAP BW data source plugin')
    return {
      module: SapBwPlugin,
      global: true
    }
  },
  async onStart(ctx) {
    ctx.logger.log('SAP BW data source plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('SAP BW data source plugin stopped')
  }
}

export { SAP_BW_TYPE, SAP_BW_VARIABLES_REQUEST, SapBwRunner } from './lib/sap-bw.runner.js'
export type { SapBwAdapterOptions, SapBwVariable } from './lib/sap-bw.runner.js'
export { SapBwPlugin } from './lib/sap-bw.module.js'
export { SapBwDataSourceStrategy } from './lib/sap-bw.strategy.js'

export default plugin
