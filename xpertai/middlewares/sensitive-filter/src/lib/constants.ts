export const SENSITIVE_FILTER_MIDDLEWARE_NAME = 'SensitiveFilterMiddleware'

export const DEFAULT_INPUT_BLOCK_MESSAGE = '输入内容触发敏感策略，已拦截。'
export const DEFAULT_OUTPUT_BLOCK_MESSAGE = '输出内容触发敏感策略，已拦截。'
export const DEFAULT_REWRITE_TEXT = '[已过滤]'
export const DEFAULT_WECOM_TIMEOUT_MS = 10000

export const CONFIG_PARSE_ERROR = '敏感词过滤配置格式不正确，请检查填写内容。'
export const BUSINESS_RULES_VALIDATION_ERROR =
  '请至少配置 1 条有效业务规则（pattern/type/action/scope/severity）。'
export const LLM_MODE_VALIDATION_ERROR = '请完善 LLM 过滤配置：需填写过滤模型、生效范围、审核规则说明。'

export const INTERNAL_LLM_INVOKE_TAG = 'sensitive-filter/internal-eval'
export const INTERNAL_SOURCE_STREAM_TAG = 'sensitive-filter/internal-source-stream'
export const INTERNAL_LLM_INVOKE_OPTIONS = {
  tags: [INTERNAL_LLM_INVOKE_TAG],
  metadata: {
    internal: true,
  },
}
