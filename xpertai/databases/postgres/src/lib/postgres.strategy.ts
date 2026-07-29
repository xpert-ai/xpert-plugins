import { Injectable } from '@nestjs/common'
import {
  AdapterDataSourceStrategy,
  DataSourceStrategy
} from '@xpert-ai/plugin-sdk'
import {
  POSTGRES_TYPE,
  PostgresAdapterOptions,
  PostgresRunner
} from './postgres.runner.js'

@Injectable()
@DataSourceStrategy(POSTGRES_TYPE)
export class PostgresDataSourceStrategy extends AdapterDataSourceStrategy<PostgresAdapterOptions> {
  override readonly type = POSTGRES_TYPE
  override readonly name = 'PostgreSQL Data Source'

  constructor() {
    super(PostgresRunner)
  }
}
