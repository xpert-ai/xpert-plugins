import { readFileSync } from 'node:fs'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { MariaDbPlugin } from './lib/mariadb.module.js'
import { MARIADB_ICON } from './lib/mariadb.types.js'

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
    throw new Error('Invalid MariaDB plugin package metadata')
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
    icon: { type: 'svg', value: MARIADB_ICON },
    displayName: 'MariaDB Data Source',
    description:
      'Provide MariaDB connectivity through the MySQL-compatible runner',
    keywords: ['mariadb', 'mysql', 'database', 'datasource', 'sql'],
    author: 'XpertAI Team'
  },
  config: { schema: ConfigSchema },
  register(ctx) {
    ctx.logger.log('Registering MariaDB data source plugin')
    return { module: MariaDbPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('MariaDB data source plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('MariaDB data source plugin stopped')
  }
}

export { MARIADB_TYPE, MariaDbRunner } from './lib/mariadb.runner.js'
export type { MariaDbAdapterOptions } from './lib/mariadb.runner.js'
export { MariaDbPlugin } from './lib/mariadb.module.js'
export { MariaDbDataSourceStrategy } from './lib/mariadb.strategy.js'

export default plugin
