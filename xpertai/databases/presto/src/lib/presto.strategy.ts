import { Injectable } from '@nestjs/common'
import {
  AdapterDataSourceStrategy,
  DataSourceStrategy
} from '@xpert-ai/plugin-sdk'
import {
  PRESTO_TYPE,
  PrestoAdapterOptions,
  PrestoQueryRunner
} from './presto.runner.js'

@Injectable()
@DataSourceStrategy(PRESTO_TYPE)
export class PrestoDataSourceStrategy extends AdapterDataSourceStrategy<PrestoAdapterOptions> {
  override readonly type = PRESTO_TYPE
  override readonly name = 'Presto Data Source'

  constructor() {
    super(PrestoQueryRunner)
  }
}
