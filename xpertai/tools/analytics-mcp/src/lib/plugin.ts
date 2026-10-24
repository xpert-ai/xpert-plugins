import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { McpAnalyticsProvider } from './provider'

@XpertServerPlugin({ providers: [McpAnalyticsProvider] })
export class AnalyticsMcpPlugin {}
