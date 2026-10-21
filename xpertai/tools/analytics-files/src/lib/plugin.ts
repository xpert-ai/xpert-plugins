import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import { FileAnalyticsProvider } from './provider'

@XpertServerPlugin({ providers: [FileAnalyticsProvider] })
export class AnalyticsFilesPlugin {}
