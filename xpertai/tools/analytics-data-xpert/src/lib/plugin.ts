import { DataXpertAnalyticsClient } from './client'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { DataXpertAnalyticsProvider } from './provider'
import { CqrsModule } from '@nestjs/cqrs'
import { DataXpertAnalyticsIntegration } from './integration'
@XpertServerPlugin({ imports: [CqrsModule], providers: [DataXpertAnalyticsProvider, DataXpertAnalyticsClient, DataXpertAnalyticsIntegration] })
export class AnalyticsDataXpertPlugin {}
