import { Injectable } from '@nestjs/common'
import {
  AdapterDataSourceStrategy,
  DataSourceStrategy
} from '@xpert-ai/plugin-sdk'
import {
  KINGBASE_TYPE,
  KingbaseAdapterOptions,
  KingbaseRunner
} from './kingbase.runner.js'

@Injectable()
@DataSourceStrategy(KINGBASE_TYPE)
export class KingbaseDataSourceStrategy extends AdapterDataSourceStrategy<KingbaseAdapterOptions> {
  override readonly type = KINGBASE_TYPE
  override readonly name = 'KingbaseES Data Source'

  constructor() {
    super(KingbaseRunner)
  }
}
