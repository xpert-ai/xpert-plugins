import { Injectable } from '@nestjs/common'
import { AdapterDataSourceStrategy, DataSourceStrategy } from '@xpert-ai/plugin-sdk'
import { HANA } from './types.js'
import { HANAAdapter } from './hana.js'

@Injectable()
@DataSourceStrategy(HANA)
export class HANADataSourceStrategy extends AdapterDataSourceStrategy {
  override type: string
  override name: string
  constructor() {
    super(HANAAdapter, [])
    this.type = HANA
    this.name = 'HANA Data Source'
  }
}
