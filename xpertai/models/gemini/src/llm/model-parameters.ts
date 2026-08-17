export type GeminiModelOptions = Record<string, unknown>

function toBoolean(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1'
}

export function toGeminiFiniteNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined
  }
  const numberValue = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numberValue) ? numberValue : undefined
}

export function buildGeminiInvocationParams(
  baseParams: { tools?: unknown[]; [key: string]: unknown },
  modelOptions: GeminiModelOptions
) {
  const thinkingMode = modelOptions['thinking_mode']
  const thinkingBudget = toGeminiFiniteNumber(modelOptions['thinking_budget'])
  const thinkingLevel = modelOptions['thinking_level']
  const includeThoughts = modelOptions['include_thoughts']
  const hasThinkingConfig =
    thinkingMode !== undefined ||
    thinkingBudget !== undefined ||
    thinkingLevel !== undefined ||
    includeThoughts !== undefined

  const thinkingConfig = hasThinkingConfig
    ? {
        ...(thinkingMode !== undefined && !toBoolean(thinkingMode)
          ? { thinkingBudget: 0 }
          : thinkingBudget !== undefined
            ? { thinkingBudget }
            : {}),
        ...(typeof thinkingLevel === 'string' ? { thinkingLevel: thinkingLevel.toUpperCase() } : {}),
        ...(includeThoughts === undefined ? {} : { includeThoughts: toBoolean(includeThoughts) })
      }
    : undefined

  const generationConfig = Object.fromEntries(
    Object.entries({
      temperature: toGeminiFiniteNumber(modelOptions['temperature']),
      topP: toGeminiFiniteNumber(modelOptions['top_p']),
      topK: toGeminiFiniteNumber(modelOptions['top_k']),
      maxOutputTokens: toGeminiFiniteNumber(modelOptions['max_output_tokens'] ?? modelOptions['max_tokens']),
      thinkingConfig
    }).filter(([, value]) => value !== undefined)
  )
  const tools = [...(baseParams.tools ?? [])]

  if (toBoolean(modelOptions['grounding'])) {
    tools.push({ googleSearch: {} })
  }
  if (toBoolean(modelOptions['url_context'])) {
    tools.push({ urlContext: {} })
  }
  if (toBoolean(modelOptions['code_execution'])) {
    tools.push({ codeExecution: {} })
  }

  return {
    ...baseParams,
    ...(Object.keys(generationConfig).length ? { generationConfig } : {}),
    ...(tools.length ? { tools } : {})
  }
}
