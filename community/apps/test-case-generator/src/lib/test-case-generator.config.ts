import { z } from 'zod/v3'
import type { JsonSchemaObjectType } from '@xpert-ai/contracts'

export const TestCaseGeneratorPluginConfigSchema = z.object({
  enabled: z.boolean().default(true),
  defaultGranularity: z.enum(['basic', 'detailed']).default('basic'),
  maxGeneratedCases: z.number().int().min(1).max(50).default(10),
  requirementMinLength: z.number().int().min(5).max(100).default(20)
})

export const TestCaseGeneratorPluginConfigFormSchema: JsonSchemaObjectType = {
  type: 'object',
  properties: {
    enabled: {
      type: 'boolean',
      title: {
        en_US: 'Enabled',
        zh_Hans: '启用'
      },
      default: true
    },
    defaultGranularity: {
      type: 'string',
      title: {
        en_US: 'Default granularity',
        zh_Hans: '默认粒度'
      },
      enum: ['basic', 'detailed'],
      default: 'basic'
    },
    maxGeneratedCases: {
      type: 'number',
      title: {
        en_US: 'Max generated cases per project',
        zh_Hans: '每个项目最大生成用例数'
      },
      minimum: 1,
      maximum: 50,
      default: 10
    },
    requirementMinLength: {
      type: 'number',
      title: {
        en_US: 'Requirement text minimum length',
        zh_Hans: '需求描述最小字数'
      },
      minimum: 5,
      maximum: 100,
      default: 20
    }
  }
}

export function readTestCaseGeneratorPluginEnvDefaults() {
  const rawMaxCases = Number(process.env['TEST_CASE_GENERATOR_MAX_CASES'])
  const rawMinLength = Number(process.env['TEST_CASE_GENERATOR_REQUIREMENT_MIN_LENGTH'])
  const granularity = process.env['TEST_CASE_GENERATOR_DEFAULT_GRANULARITY']
  return {
    enabled: process.env['TEST_CASE_GENERATOR_ENABLED'] !== 'false',
    defaultGranularity: granularity === 'detailed' ? ('detailed' as const) : ('basic' as const),
    maxGeneratedCases: Number.isInteger(rawMaxCases) && rawMaxCases > 0 ? rawMaxCases : 10,
    requirementMinLength: Number.isInteger(rawMinLength) && rawMinLength > 0 ? rawMinLength : 20
  }
}
