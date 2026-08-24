import { z } from 'zod/v3'
import type { ValveAssistantContextV1 } from './types'

export const valveAssistantContextValueSchema = z
  .object({
    version: z.literal(1),
    resourceId: z.string().min(1),
    snapshotId: z.string().min(1),
    graphVersion: z.string().min(1),
    partitionKey: z.string().min(1).optional(),
    entityId: z.string().min(1),
    entityTypeCode: z.string().min(1),
    externalKey: z.string().min(1),
    label: z.string().min(1)
  })
  .strict()

export const valveAssistantRequestContextSchema = z
  .object({
    valve_business_workbench: valveAssistantContextValueSchema.optional()
  })
  .strict()

export function readValveRuntimeContext(config: unknown): ValveAssistantContextV1 | undefined {
  const candidate = readRuntimeConfig(config)
  const parsed = valveAssistantRequestContextSchema.safeParse(candidate)
  return parsed.success ? parsed.data.valve_business_workbench : undefined
}

function readRuntimeConfig(config: unknown): unknown {
  if (!config || typeof config !== 'object') return {}
  const record = config as Record<string, unknown>
  if (record['context'] && typeof record['context'] === 'object') return record['context']
  const configurable = record['configurable']
  if (configurable && typeof configurable === 'object') {
    const nested = (configurable as Record<string, unknown>)['context']
    if (nested && typeof nested === 'object') return nested
  }
  return {}
}
