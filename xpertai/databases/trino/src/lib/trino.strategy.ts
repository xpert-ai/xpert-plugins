import { Injectable } from '@nestjs/common'
import {
  AdapterDataSourceStrategy,
  DataSourceStrategy
} from '@xpert-ai/plugin-sdk'
import {
  TRINO_TYPE,
  TrinoAdapterOptions,
  TrinoQueryRunner
} from './trino.runner.js'

@Injectable()
@DataSourceStrategy(TRINO_TYPE)
export class TrinoDataSourceStrategy extends AdapterDataSourceStrategy<TrinoAdapterOptions> {
  override readonly type = TRINO_TYPE
  override readonly name = 'Trino Data Source'

  constructor() {
    super(TrinoQueryRunner)
  }
}
