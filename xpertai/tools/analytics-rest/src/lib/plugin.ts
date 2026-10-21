import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { RestAnalyticsProvider } from './provider'

@XpertServerPlugin({ providers: [RestAnalyticsProvider] })
export class AnalyticsRestPlugin {}
