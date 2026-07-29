import { Injectable } from '@nestjs/common'
import {
  AdapterDataSourceStrategy,
  DataSourceStrategy
} from '@xpert-ai/plugin-sdk'
import {
  CLICKHOUSE_TYPE,
  ClickHouseAdapterOptions,
  ClickHouseRunner
} from './clickhouse.runner.js'

@Injectable()
@DataSourceStrategy(CLICKHOUSE_TYPE)
export class ClickHouseDataSourceStrategy extends AdapterDataSourceStrategy<ClickHouseAdapterOptions> {
  override readonly type = CLICKHOUSE_TYPE
  override readonly name = 'ClickHouse Data Source'

  constructor() {
    super(ClickHouseRunner)
  }
}
