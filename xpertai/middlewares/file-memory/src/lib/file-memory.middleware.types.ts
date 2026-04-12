import { AiModelTypeEnum, ICopilotModel, JsonSchemaObjectType } from '@xpert-ai/contracts'
import { z } from 'zod/v3'

const writebackSchema = z.object({
  waitPolicy: z.enum(['never_wait', 'soft_drain']).optional(),
  model: z.custom<ICopilotModel>((value) => Boolean(value)).optional(),
  qaPrompt: z.string().optional(),
  profilePrompt: z.string().optional()
})

const recallSchema = z.object({
  mode: z.enum(['hybrid_async', 'legacy_blocking']).optional(),
  model: z.custom<ICopilotModel>((value) => Boolean(value)).optional(),
  timeoutMs: z.number().int().positive().optional(),
  maxSelected: z.number().int().positive().optional(),
  prompt: z.string().optional()
})

export const fileMemorySystemMiddlewareOptionsSchema = z.object({
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
    recall: {
      type: 'object',
      title: {
        en_US: 'Recall',
        zh_Hans: '自动召回'
      },
      properties: {
        mode: {
          type: 'string',
          title: {
            en_US: 'Recall Mode',
            zh_Hans: '召回模式'
          },
          enum: ['hybrid_async', 'legacy_blocking'],
          default: 'hybrid_async',
          'x-ui': {
            enumLabels: {
              hybrid_async: {
                en_US: 'Hybrid Async',
                zh_Hans: '混合异步'
              },
              legacy_blocking: {
                en_US: 'Legacy Blocking',
                zh_Hans: '传统阻塞'
              }
            },
            help: {
              en_US: 'https://www.npmjs.com/package/@xpert-ai/plugin-file-memory?activeTab=readme'
            }
          }
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
      },
      'x-ui': {
        span: 2,
      }
    },
    writeback: {
      type: 'object',
      title: {
        en_US: 'Writeback',
        zh_Hans: '自动写回'
      },
      properties: {
        waitPolicy: {
          type: 'string',
          title: {
            en_US: 'Interactive Wait Policy',
            zh_Hans: '结束等待策略'
          },
          enum: ['never_wait', 'soft_drain'],
          default: 'never_wait',
          'x-ui': {
            enumLabels: {
              never_wait: {
                en_US: 'Never Wait',
                zh_Hans: '从不等待'
              },
              soft_drain: {
                en_US: 'Soft Drain',
                zh_Hans: '软性等待'
              }
            }
          }
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
      },
      'x-ui': {
        span: 2,
      }
    }
  },
  'x-ui': {
    cols: 2
  }
} as JsonSchemaObjectType
