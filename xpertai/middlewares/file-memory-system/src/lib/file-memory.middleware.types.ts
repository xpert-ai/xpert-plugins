import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { z } from 'zod/v3'

export const FileMemorySystemIcon = `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect x="4" y="4" width="56" height="56" rx="10" fill="#1f3a5f"/>
  <path fill="#8fd3ff" d="M18 17h18l10 10v20a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4V21a4 4 0 0 1 4-4z"/>
  <path fill="#dff4ff" d="M36 17v10h10z"/>
  <path fill="#1f3a5f" d="M21 33h22v3H21zm0 7h18v3H21z"/>
  <circle cx="23" cy="24" r="3" fill="#ffce70"/>
  <circle cx="31" cy="24" r="3" fill="#ffce70"/>
  <circle cx="39" cy="24" r="3" fill="#ffce70"/>
</svg>`

const writebackSchema = z.object({
  enabled: z.boolean().optional(),
  waitPolicy: z.enum(['never_wait', 'soft_drain']).optional(),
  model: z.custom<ICopilotModel>((value) => Boolean(value)).optional(),
  qaPrompt: z.string().optional(),
  profilePrompt: z.string().optional()
})

const recallSchema = z.object({
  enabled: z.boolean().optional(),
  mode: z.enum(['hybrid_async', 'legacy_blocking']).optional(),
  model: z.custom<ICopilotModel>((value) => Boolean(value)).optional(),
  timeoutMs: z.number().int().positive().optional(),
  maxSelected: z.number().int().positive().optional(),
  prompt: z.string().optional()
})

export const fileMemorySystemMiddlewareOptionsSchema = z.object({
  enableLogging: z.boolean().optional(),
  recall: recallSchema.optional(),
  writeback: writebackSchema.optional()
})

export const fileMemorySystemStateSchema = z.object({
  fileMemorySurfacedPaths: z.array(z.string()).default([]),
  fileMemorySurfacedBytes: z.number().default(0)
})

export type FileMemorySystemMiddlewareOptions = z.infer<typeof fileMemorySystemMiddlewareOptionsSchema>

export const fileMemoryMiddlewareConfigSchema = {
  type: 'object',
  properties: {
    enableLogging: {
      type: 'boolean',
      title: {
        en_US: 'Enable Logging',
        zh_Hans: '开启日志'
      }
    },
    recall: {
      type: 'object',
      title: {
        en_US: 'Recall',
        zh_Hans: '自动召回'
      },
      properties: {
        enabled: {
          type: 'boolean',
          title: {
            en_US: 'Enabled',
            zh_Hans: '启用'
          }
        },
        mode: {
          type: 'string',
          title: {
            en_US: 'Recall Mode',
            zh_Hans: '召回模式'
          },
          enum: ['hybrid_async', 'legacy_blocking'],
          default: 'hybrid_async'
        },
        model: {
          type: 'object',
          title: {
            en_US: 'Recall Model',
            zh_Hans: '召回模型'
          },
          'x-ui': {
            component: 'ai-model-select',
            inputs: {
              modelType: AiModelTypeEnum.LLM,
              hiddenLabel: true
            }
          }
        },
        timeoutMs: {
          type: 'number',
          title: {
            en_US: 'Detached Selector Budget (ms)',
            zh_Hans: '后台选择预算(ms)'
          },
          default: 1500
        },
        maxSelected: {
          type: 'number',
          title: {
            en_US: 'Max Selected Total',
            zh_Hans: '最多召回总数'
          }
        },
        prompt: {
          type: 'string',
          title: {
            en_US: 'Selector Prompt',
            zh_Hans: '选择提示词'
          },
          'x-ui': {
            component: 'textarea',
            span: 2
          }
        }
      }
    },
    writeback: {
      type: 'object',
      title: {
        en_US: 'Writeback',
        zh_Hans: '自动写回'
      },
      properties: {
        enabled: {
          type: 'boolean',
          title: {
            en_US: 'Enabled',
            zh_Hans: '启用'
          }
        },
        waitPolicy: {
          type: 'string',
          title: {
            en_US: 'Interactive Wait Policy',
            zh_Hans: '结束等待策略'
          },
          enum: ['never_wait', 'soft_drain'],
          default: 'never_wait'
        },
        model: {
          type: 'object',
          title: {
            en_US: 'Writeback Model',
            zh_Hans: '写回模型'
          },
          'x-ui': {
            component: 'ai-model-select',
            inputs: {
              modelType: AiModelTypeEnum.LLM,
              hiddenLabel: true
            }
          }
        },
        qaPrompt: {
          type: 'string',
          title: {
            en_US: 'QA Prompt',
            zh_Hans: 'QA 提示词'
          },
          'x-ui': {
            component: 'textarea',
            span: 2
          }
        },
        profilePrompt: {
          type: 'string',
          title: {
            en_US: 'Profile Prompt',
            zh_Hans: 'Profile 提示词'
          },
          'x-ui': {
            component: 'textarea',
            span: 2
          }
        }
      }
    }
  }
} as const
