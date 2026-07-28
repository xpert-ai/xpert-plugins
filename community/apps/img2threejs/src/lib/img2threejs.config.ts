import { z } from 'zod/v3'

export const Img2ThreeJsConfigSchema = z.object({
  debug: z.boolean(),
  maximumImageBytes: z.number().int().min(1_000_000).max(100_000_000),
  queueAttempts: z.number().int().min(1).max(5),
  queueBackoffMs: z.number().int().min(1000).max(120_000)
}).strict()

export type Img2ThreeJsConfig = z.infer<typeof Img2ThreeJsConfigSchema>

export const Img2ThreeJsConfigFormSchema = {
  type: 'object',
  properties: {
    debug: {
      type: 'boolean',
      title: { en_US: 'Debug logging', zh_Hans: '调试日志' },
      description: {
        en_US: 'Enable redacted debug and info checkpoints.',
        zh_Hans: '启用经过脱敏的调试和信息检查点。'
      }
    },
    maximumImageBytes: {
      type: 'number',
      title: { en_US: 'Maximum image bytes', zh_Hans: '最大图片字节数' },
      minimum: 1000000,
      maximum: 100000000
    },
    queueAttempts: {
      type: 'number',
      title: { en_US: 'Queue attempts', zh_Hans: '队列尝试次数' },
      minimum: 1,
      maximum: 5
    },
    queueBackoffMs: {
      type: 'number',
      title: { en_US: 'Queue retry backoff (ms)', zh_Hans: '队列重试退避（毫秒）' },
      minimum: 1000,
      maximum: 120000
    }
  }
} as const
