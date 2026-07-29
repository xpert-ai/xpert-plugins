import { Injectable } from '@nestjs/common'
import {
  AdapterDataSourceStrategy,
  DataSourceStrategy
} from '@xpert-ai/plugin-sdk'
import {
  OPENGAUSS_TYPE,
  OpenGaussAdapterOptions,
  OpenGaussRunner
} from './opengauss.runner.js'

@Injectable()
@DataSourceStrategy(OPENGAUSS_TYPE)
export class OpenGaussDataSourceStrategy extends AdapterDataSourceStrategy<OpenGaussAdapterOptions> {
  override readonly type = OPENGAUSS_TYPE
  override readonly name = 'OpenGauss Data Source'

  constructor() {
    super(OpenGaussRunner)
  }
}
