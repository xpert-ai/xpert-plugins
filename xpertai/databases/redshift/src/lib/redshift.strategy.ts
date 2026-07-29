import { Injectable } from '@nestjs/common'
import {
  AdapterDataSourceStrategy,
  DataSourceStrategy
} from '@xpert-ai/plugin-sdk'
import {
  REDSHIFT_TYPE,
  RedshiftAdapterOptions,
  RedshiftRunner
} from './redshift.runner.js'

@Injectable()
@DataSourceStrategy(REDSHIFT_TYPE)
export class RedshiftDataSourceStrategy extends AdapterDataSourceStrategy<RedshiftAdapterOptions> {
  override readonly type = REDSHIFT_TYPE
  override readonly name = 'Amazon Redshift Data Source'

  constructor() {
    super(RedshiftRunner)
  }
}
