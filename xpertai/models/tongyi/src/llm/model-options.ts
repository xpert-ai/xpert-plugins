import type { TongyiModelCredentials } from '../types.js'

interface ModelControls {
  fixedSampling?: boolean
  thinking: 'always' | 'toggle' | 'effort'
  efforts?: readonly string[]
  search?: boolean
  jsonObject?: boolean
  toolChoice?: 'auto' | 'unsupported'
}

const DEEPSEEK_CONTROLS: ModelControls = {
  thinking: 'toggle', efforts: ['low', 'high', 'max'], search: true, jsonObject: true
}

// Explicit provider contracts, not model-name pattern matching. Unlisted custom models retain existing behavior.
const MODEL_CONTROLS: Readonly<Record<string, ModelControls>> = {
  'deepseek-v4.1-flash': DEEPSEEK_CONTROLS,
  'deepseek-v4.1-flash-1017': DEEPSEEK_CONTROLS,
  'MiniMax/MiniMax-M3.1-Flash': {
    fixedSampling: true, thinking: 'always', efforts: ['low', 'medium', 'high', 'xhigh', 'max'], toolChoice: 'auto'
  },
  'xiaomi/mimo-v2.6-pro-ultraspeed': {
    fixedSampling: true, thinking: 'toggle', jsonObject: true, toolChoice: 'auto'
  },
  'stepfun/step-5-preview': {
    thinking: 'toggle', efforts: ['low', 'medium', 'high'], jsonObject: true, toolChoice: 'unsupported'
  },
  'ZHIPU/GLM-5.3-FlashX': {
    thinking: 'always', efforts: ['low', 'high', 'max'], jsonObject: true
  },
  'qwen3.8-omni-flash': {
    thinking: 'effort', efforts: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'], search: true
  }
}

export function hasTongyiFixedSampling(model: string): boolean {
  return hasTongyiModelControls(model) && MODEL_CONTROLS[model].fixedSampling === true
}

export function hasTongyiModelControls(model: string): boolean {
  return Object.prototype.hasOwnProperty.call(MODEL_CONTROLS, model)
}

export function getTongyiStructuredToolChoice(model: string): ModelControls['toolChoice'] {
  return hasTongyiModelControls(model) ? MODEL_CONTROLS[model].toolChoice : undefined
}

export function resolveTongyiModelOptions(model: string, options: Partial<TongyiModelCredentials> = {}): TongyiModelCredentials {
  const controls = hasTongyiModelControls(model) ? MODEL_CONTROLS[model] : undefined
  if (!controls) return { ...options, temperature: options.temperature ?? 0 }
  const effort = controls.thinking === 'effort' && options.enable_thinking === false ? 'none' : options.reasoning_effort
  if (controls.efforts && effort !== undefined && !controls.efforts.includes(String(effort))) {
    throw new Error(`${model}: reasoning_effort must be one of ${controls.efforts.join(', ')}`)
  }
  if (options.response_format && options.response_format !== 'text' &&
    !(options.response_format === 'json_object' && controls.jsonObject)) {
    throw new Error(`${model}: unsupported response_format ${options.response_format}`)
  }
  return {
    ...options,
    temperature: controls.fixedSampling ? undefined : options.temperature,
    top_p: controls.fixedSampling ? undefined : options.top_p,
    frequency_penalty: undefined,
    enable_thinking: controls.thinking === 'toggle' ? options.enable_thinking : undefined,
    reasoning_effort: controls.efforts ? effort : undefined,
    thinking_budget: undefined,
    tool_stream: undefined,
    enable_search: controls.search ? options.enable_search : undefined
  }
}

interface ToolRequestControls {
  tool_choice?: unknown
  stop?: unknown
  parallel_tool_calls?: unknown
}

export function validateTongyiToolControls(model: string, request: ToolRequestControls): void {
  const controls = hasTongyiModelControls(model) ? MODEL_CONTROLS[model] : undefined
  if (!controls) return
  if (request.tool_choice != null && controls.toolChoice &&
    (controls.toolChoice === 'unsupported' || request.tool_choice !== 'auto')) {
    throw new Error(`${model}: tool_choice ${controls.toolChoice === 'auto' ? 'only supports auto' : 'is unsupported'}`)
  }
  if (model === 'MiniMax/MiniMax-M3.1-Flash' && (request.stop != null || request.parallel_tool_calls === false)) {
    throw new Error(`${model}: stop and disabling parallel tool calls are unsupported`)
  }
}
