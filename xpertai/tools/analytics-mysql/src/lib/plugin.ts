import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { DorisAnalyticsProvider, MysqlAnalyticsProvider } from './provider'
@XpertServerPlugin({ providers: [MysqlAnalyticsProvider, DorisAnalyticsProvider] })
export class AnalyticsMysqlPlugin {}
