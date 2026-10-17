import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { DataXpertAnalyticsProvider } from './provider'
@XpertServerPlugin({ providers: [DataXpertAnalyticsProvider] })
export class AnalyticsDataXpertPlugin {}
