import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { PostgresAnalyticsProvider } from './provider'
@XpertServerPlugin({ providers: [PostgresAnalyticsProvider] })
export class AnalyticsPostgresPlugin {}
