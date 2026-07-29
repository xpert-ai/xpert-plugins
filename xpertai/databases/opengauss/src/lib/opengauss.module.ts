import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { OpenGaussDataSourceStrategy } from './opengauss.strategy.js'

@XpertServerPlugin({
  providers: [OpenGaussDataSourceStrategy]
})
export class OpenGaussPlugin {}
