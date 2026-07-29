import { readFileSync } from 'node:fs'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { XmlaPlugin } from './lib/xmla.module.js'
import { XMLA_ICON } from './lib/xmla.types.js'

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
    throw new Error('Invalid XMLA plugin package metadata')
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
      value: XMLA_ICON
    },
    displayName: 'XMLA Data Source',
    description:
      'Proxy XMLA SOAP requests with authentication, cookie reuse, and TLS controls',
    keywords: ['xmla', 'olap', 'mdx', 'soap', 'datasource'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema
  },
  register(ctx) {
    ctx.logger.log('Registering XMLA data source plugin')
    return {
      module: XmlaPlugin,
      global: true
    }
  },
  async onStart(ctx) {
    ctx.logger.log('XMLA data source plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('XMLA data source plugin stopped')
  }
}

export {
  XMLA_TYPE,
  XMLARunner,
  createXmlaConfigurationSchema
} from './lib/xmla.runner.js'
export type {
  XmlaAdapterOptions,
  XmlaHttpClient,
  XmlaHttpClientFactory
} from './lib/xmla.runner.js'
export { XmlaPlugin } from './lib/xmla.module.js'
export { XmlaDataSourceStrategy } from './lib/xmla.strategy.js'

export default plugin
