import { z } from 'zod/v3'
import type { IIntegration } from '@xpert-ai/contracts'
import { IntegrationStrategyKey, type IntegrationStrategy, type TIntegrationStrategyParams } from '@xpert-ai/plugin-sdk'
export const DATA_XPERT_INTEGRATION = 'analytics-data-xpert'
export const connectionSchema = z.object({
  baseUrl: z.string().url().refine(value => { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash }),
  audience: z.string().min(1)
}).strict()
@IntegrationStrategyKey(DATA_XPERT_INTEGRATION)
export class DataXpertAnalyticsIntegration implements IntegrationStrategy<z.output<typeof connectionSchema>> {
  readonly meta = { name: DATA_XPERT_INTEGRATION, label: { en_US: 'data-xpert Analytics', zh_Hans: 'data-xpert 分析服务' }, icon: { type: 'font' as const, value: 'ri-bar-chart-box-line' },
    schema: { type: 'object' as const, properties: { baseUrl: { type: 'string' as const, title: 'API URL' }, audience: { type: 'string' as const, title: 'OIDC audience' } }, required: ['baseUrl', 'audience'] } }
  prepareConfig(config: z.output<typeof connectionSchema>) { return connectionSchema.parse(config) }
  async validateConfig(config: z.output<typeof connectionSchema>) { connectionSchema.parse(config) }
  async execute(_integration: IIntegration<z.output<typeof connectionSchema>>, _payload: TIntegrationStrategyParams): Promise<never> { throw new Error('DATAX_USE_ANALYTICS_RUNTIME') }
}
