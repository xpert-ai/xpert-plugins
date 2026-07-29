import { Injectable } from '@nestjs/common'
import {
  AdapterDataSourceStrategy,
  DataSourceStrategy
} from '@xpert-ai/plugin-sdk'
import {
  MSSQL_TYPE,
  MssqlAdapterOptions,
  MssqlRunner
} from './mssql.runner.js'

@Injectable()
@DataSourceStrategy(MSSQL_TYPE)
export class MssqlDataSourceStrategy extends AdapterDataSourceStrategy<MssqlAdapterOptions> {
  override readonly type = MSSQL_TYPE
  override readonly name = 'Microsoft SQL Server Data Source'

  constructor() {
    super(MssqlRunner)
  }
}
