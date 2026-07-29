import { Injectable } from '@nestjs/common'
import {
  AdapterDataSourceStrategy,
  DataSourceStrategy
} from '@xpert-ai/plugin-sdk'
import {
  MARIADB_TYPE,
  MariaDbAdapterOptions,
  MariaDbRunner
} from './mariadb.runner.js'

@Injectable()
@DataSourceStrategy(MARIADB_TYPE)
export class MariaDbDataSourceStrategy extends AdapterDataSourceStrategy<MariaDbAdapterOptions> {
  override readonly type = MARIADB_TYPE
  override readonly name = 'MariaDB Data Source'

  constructor() {
    super(MariaDbRunner)
  }
}
