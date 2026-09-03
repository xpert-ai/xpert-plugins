import { isAbsolute } from 'node:path'
import type { JsonSchemaObjectType } from '@xpert-ai/contracts'
import { z } from 'zod/v3'

export const ZsxqPluginConfigSchema = z
  .object({
    enableWrites: z.boolean().default(false),
    cliDataRoot: z
      .string()
      .trim()
      .min(1)
      .max(1_024)
      .refine(isAbsolute, 'CLI data root must be an absolute path.')
      .optional()
  })
  .strict()

export type ZsxqPluginConfig = z.infer<typeof ZsxqPluginConfigSchema>

export const ZsxqPluginConfigFormSchema: JsonSchemaObjectType = {
  type: 'object',
  properties: {
    enableWrites: {
      type: 'boolean',
      default: false,
      title: { en_US: 'Enable write tools', zh_Hans: '启用写入工具' },
      description: {
        en_US: 'Expose publishing and management tools. Configure Xpert HITL approval for every enabled write tool.',
        zh_Hans: '开放发布和管理工具。启用后必须为全部写入工具配置 Xpert 人工审批。'
      },
      'x-ui': { component: 'checkbox', span: 2 }
    },
    cliDataRoot: {
      type: 'string',
      title: { en_US: 'CLI data root', zh_Hans: 'CLI 数据目录' },
      description: {
        en_US:
          'Optional durable absolute directory for isolated zsxq-cli connection state. Required for container deployments without a persistent home directory.',
        zh_Hans: '可选的持久化绝对目录，用于隔离保存 zsxq-cli 连接状态。容器 Home 目录不持久时必须配置。'
      },
      'x-ui': { span: 2 }
    }
  }
}
