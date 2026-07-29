import { Injectable } from '@nestjs/common'
import {
  AdapterDataSourceStrategy,
  DataSourceStrategy
} from '@xpert-ai/plugin-sdk'
import {
  SAP_BW_TYPE,
  SapBwAdapterOptions,
  SapBwRunner
} from './sap-bw.runner.js'

@Injectable()
@DataSourceStrategy(SAP_BW_TYPE)
export class SapBwDataSourceStrategy extends AdapterDataSourceStrategy<SapBwAdapterOptions> {
  override readonly type = SAP_BW_TYPE
  override readonly name = 'SAP BW Data Source'

  constructor() {
    super(SapBwRunner)
  }
}
