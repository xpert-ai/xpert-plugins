import { z } from 'zod/v3'
import type { JsonSchemaObjectType } from '@xpert-ai/contracts'

export const ContractReviewPluginConfigSchema = z.object({
  enabled: z.boolean().default(true),
  defaultPageSize: z.number().int().min(5).max(100).default(25),
  /** 超过这个秒数没有收到 AI 的任何条款回写，就把本次审查标记为失败并允许重试 */
  extractionTimeoutSeconds: z.number().int().min(30).max(1800).default(180)
})

export const ContractReviewPluginConfigFormSchema: JsonSchemaObjectType = {
  type: 'object',
  properties: {
    enabled: {
      type: 'boolean',
      title: { en_US: 'Enabled', zh_Hans: '启用' },
      default: true
    },
    defaultPageSize: {
      type: 'number',
      title: { en_US: 'Default page size', zh_Hans: '默认分页大小' },
      minimum: 5,
      maximum: 100,
      default: 25
    },
    extractionTimeoutSeconds: {
      type: 'number',
      title: { en_US: 'Extraction timeout (seconds)', zh_Hans: 'AI 审查超时（秒）' },
      description: {
        en_US: 'If the Agent writes back no clause within this window, the case is marked failed and can be retried.',
        zh_Hans: '超过该时长 AI 未回写任何条款，本次审查记为失败，可原地重试。'
      },
      minimum: 30,
      maximum: 1800,
      default: 180
    }
  }
}

export function readContractReviewPluginEnvDefaults() {
  const rawPageSize = Number(process.env['CONTRACT_REVIEW_DEFAULT_PAGE_SIZE'])
  const rawTimeout = Number(process.env['CONTRACT_REVIEW_EXTRACTION_TIMEOUT_SECONDS'])
  return {
    enabled: process.env['CONTRACT_REVIEW_ENABLED'] !== 'false',
    defaultPageSize:
      Number.isInteger(rawPageSize) && rawPageSize >= 5 && rawPageSize <= 100 ? rawPageSize : 25,
    extractionTimeoutSeconds:
      Number.isInteger(rawTimeout) && rawTimeout >= 30 && rawTimeout <= 1800 ? rawTimeout : 180
  }
}
