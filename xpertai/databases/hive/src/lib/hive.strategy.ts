import { Injectable } from '@nestjs/common'
import {
  AdapterDataSourceStrategy,
  DataSourceStrategy
} from '@xpert-ai/plugin-sdk'
import {
  HIVE_TYPE,
  HiveAdapterOptions,
  HiveQueryRunner
} from './hive.runner.js'

@Injectable()
@DataSourceStrategy(HIVE_TYPE)
export class HiveDataSourceStrategy extends AdapterDataSourceStrategy<HiveAdapterOptions> {
  override readonly type = HIVE_TYPE
  override readonly name = 'Apache Hive Data Source'

  constructor() {
    super(HiveQueryRunner)
  }
}
