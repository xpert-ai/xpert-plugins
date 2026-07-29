import { readFileSync } from 'node:fs'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { MySQLPlugin } from './lib/mysql.module.js'
import { SvgIcon } from './lib/types.js'

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
    throw new Error('Invalid MySQL plugin package metadata')
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
      value: SvgIcon
    },
    displayName: 'MySQL Data Source',
    description:
      'Provide MySQL database connectivity and querying capabilities',
    keywords: ['mysql', 'database', 'datasource'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema
  },
  register(ctx) {
    ctx.logger.log('register mysql data source plugin')
    return {
      module: MySQLPlugin,
      global: true
    }
  },
  async onStart(ctx) {
    ctx.logger.log('mysql data source plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('mysql data source plugin stopped')
  }
}

export {
  MYSQL_TYPE,
  MySQLRunner
} from './lib/mysql.js'
export type { MysqlAdapterOptions } from './lib/mysql.js'
export { MySQLPlugin } from './lib/mysql.module.js'
export { MySQLDataSourceStrategy } from './lib/mysql.strategy.js'

export default plugin
