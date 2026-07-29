import { Injectable } from '@nestjs/common'
import {
  AdapterDataSourceStrategy,
  DataSourceStrategy
} from '@xpert-ai/plugin-sdk'
import {
  XMLA_TYPE,
  XMLARunner,
  XmlaAdapterOptions
} from './xmla.runner.js'

@Injectable()
@DataSourceStrategy(XMLA_TYPE)
export class XmlaDataSourceStrategy extends AdapterDataSourceStrategy<XmlaAdapterOptions> {
  override readonly type = XMLA_TYPE
  override readonly name = 'XMLA Data Source'

  constructor() {
    super(XMLARunner)
  }
}
