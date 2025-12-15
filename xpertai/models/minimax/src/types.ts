export const MiniMax = 'minimax';

// MiniMax凭证接口 - OpenAI兼容API简化版本
export interface MiniMaxCredentials {
  api_key: string;
  base_url?: string;
}

// 模型凭证扩展
export type MiniMaxModelCredentials = MiniMaxCredentials & {
  maxRetries?: number;
  modelName?: string;
  temperature?: number;
  maxTokens?: number;
};

// 官方MiniMax模型名称映射 - 扩展支持更多模型
export const MINIMAX_MODEL_MAPPING = {
  // LLM模型 - 扩展支持所有主要版本
  LLM: {
    // 最新M2系列
    'MiniMax-M2': 'MiniMax-M2',
    'MiniMax-M2-Stable': 'MiniMax-M2-Stable',
    // abab7系列
    'abab7-chat-preview': 'abab7-chat-preview',
    // abab6.5系列
    'abab6.5-chat': 'abab6.5-chat',
    'abab6.5s-chat': 'abab6.5s-chat',
    'abab6.5t-chat': 'abab6.5t-chat',
    // abab6系列
    'abab6-chat': 'abab6-chat',
    // abab5.5系列
    'abab5.5-chat': 'abab5.5-chat',
    'abab5.5s-chat': 'abab5.5s-chat',
    // abab5系列
    'abab5-chat': 'abab5-chat',
    // 文本生成模型
    'minimax-text-01': 'minimax-text-01',
    'minimax-m1': 'minimax-m1',
  },
  // Embedding模型
  EMBEDDING: {
    'embo-01': 'embo-01',
    'text-embedding-ada-002': 'text-embedding-ada-002',
  },
  
  // TTS模型 - 扩展支持更多语音模型
  TTS: {
    'speech-01': 'speech-01',
    'speech-01-hd': 'speech-01-hd',
    'speech-01-turbo': 'speech-01-turbo',
    'speech-02': 'speech-02',
    'speech-02-hd': 'speech-02-hd',
    'speech-02-turbo': 'speech-02-turbo',
    'tts-1': 'tts-1',
    'tts-1-hd': 'tts-1-hd',
  }
} as const;

// MiniMax API错误类型定义
export enum MiniMaxErrorCode {
  INVALID_API_KEY = 'invalid_api_key',
  INSUFFICIENT_BALANCE = 'insufficient_balance',
  RATE_LIMIT = 'rate_limit',
  INVALID_REQUEST = 'invalid_request',
  SERVER_ERROR = 'server_error',
  NETWORK_ERROR = 'network_error',
  AUTHENTICATION_FAILED = 'authentication_failed',
  MODEL_NOT_FOUND = 'model_not_found',
}

// MiniMax API错误类
export class MiniMaxAPIError extends Error {
  constructor(
    public code: MiniMaxErrorCode,
    message: string,
    public statusCode?: number,
    public response?: unknown
  ) {
    super(message);
    this.name = 'MiniMaxAPIError';
  }
}

// 模型配置接口
export interface MiniMaxModelConfig {
  contextSize: number;
  maxTokens?: number;
  supportsStreaming: boolean;
  supportsTools: boolean;
  pricing?: {
    input: number;
    output: number;
    unit: string;
    currency: string;
  };
}

// 模型配置映射
export const MINIMAX_MODEL_CONFIG: Record<string, MiniMaxModelConfig> = {
  // M2系列
  'MiniMax-M2': {
    contextSize: 32768,
    maxTokens: 4096,
    supportsStreaming: true,
    supportsTools: true,
    pricing: { input: 0.1, output: 0.1, unit: '0.001', currency: 'RMB' }
  },
  'MiniMax-M2-Stable': {
    contextSize: 32768,
    maxTokens: 4096,
    supportsStreaming: true,
    supportsTools: true,
    pricing: { input: 0.08, output: 0.08, unit: '0.001', currency: 'RMB' }
  },
  // abab7系列
  'abab7-chat-preview': {
    contextSize: 32768,
    maxTokens: 8192,
    supportsStreaming: true,
    supportsTools: true,
    pricing: { input: 0.05, output: 0.05, unit: '0.001', currency: 'RMB' }
  },
  // abab6.5系列
  'abab6.5-chat': {
    contextSize: 24576,
    maxTokens: 8192,
    supportsStreaming: true,
    supportsTools: true,
    pricing: { input: 0.04, output: 0.04, unit: '0.001', currency: 'RMB' }
  },
  'abab6.5s-chat': {
    contextSize: 24576,
    maxTokens: 4096,
    supportsStreaming: true,
    supportsTools: false,
    pricing: { input: 0.03, output: 0.03, unit: '0.001', currency: 'RMB' }
  },
  'abab6.5t-chat': {
    contextSize: 24576,
    maxTokens: 4096,
    supportsStreaming: true,
    supportsTools: false,
    pricing: { input: 0.03, output: 0.03, unit: '0.001', currency: 'RMB' }
  },
  // abab6系列
  'abab6-chat': {
    contextSize: 16384,
    maxTokens: 4096,
    supportsStreaming: true,
    supportsTools: true,
    pricing: { input: 0.03, output: 0.03, unit: '0.001', currency: 'RMB' }
  },
  // abab5.5系列
  'abab5.5-chat': {
    contextSize: 8192,
    maxTokens: 4096,
    supportsStreaming: true,
    supportsTools: false,
    pricing: { input: 0.02, output: 0.02, unit: '0.001', currency: 'RMB' }
  },
  'abab5.5s-chat': {
    contextSize: 8192,
    maxTokens: 2048,
    supportsStreaming: true,
    supportsTools: false,
    pricing: { input: 0.015, output: 0.015, unit: '0.001', currency: 'RMB' }
  },
  // abab5系列
  'abab5-chat': {
    contextSize: 4096,
    maxTokens: 2048,
    supportsStreaming: true,
    supportsTools: false,
    pricing: { input: 0.01, output: 0.01, unit: '0.001', currency: 'RMB' }
  },
  // TTS模型配置
  'speech-01': {
    contextSize: 0,
    supportsStreaming: false,
    supportsTools: false,
  },
  'speech-01-hd': {
    contextSize: 0,
    supportsStreaming: false,
    supportsTools: false,
  },
  'speech-02': {
    contextSize: 0,
    supportsStreaming: false,
    supportsTools: false,
  },
  'speech-02-hd': {
    contextSize: 0,
    supportsStreaming: false,
    supportsTools: false,
  },
  // Embedding模型配置
  'embo-01': {
    contextSize: 2048,
    maxTokens: 2048,
    supportsStreaming: false,
    supportsTools: false,
  },
  'text-embedding-ada-002': {
    contextSize: 8192,
    maxTokens: 8192,
    supportsStreaming: false,
    supportsTools: false,
  },
  
  // 其他LLM模型配置
  'minimax-text-01': {
    contextSize: 32768,
    maxTokens: 4096,
    supportsStreaming: true,
    supportsTools: false,
    pricing: { input: 0.02, output: 0.02, unit: '0.001', currency: 'RMB' }
  },
  'minimax-m1': {
    contextSize: 16384,
    maxTokens: 2048,
    supportsStreaming: true,
    supportsTools: false,
    pricing: { input: 0.015, output: 0.015, unit: '0.001', currency: 'RMB' }
  }
};

// 转换为LangChain参数 - 使用OpenAI兼容的base URL
export function toCredentialKwargs(credentials: MiniMaxCredentials, model?: string) {
  const credentialsKwargs: {
    apiKey: string;
    model: string | null;
    configuration: {
      baseURL: string;
    };
  } = {
    apiKey: credentials.api_key,
    model: model ?? null,
    configuration: {
      baseURL: credentials.base_url || 'https://api.minimaxi.com/v1', // 官方OpenAI兼容端点
    },
  };

  return credentialsKwargs;
}

// 转换模型名称为官方OpenAI兼容格式
export function toOfficialModelName(model: string, type: keyof typeof MINIMAX_MODEL_MAPPING): string {
  if (MINIMAX_MODEL_MAPPING[type][model as keyof typeof MINIMAX_MODEL_MAPPING[typeof type]]) {
    return MINIMAX_MODEL_MAPPING[type][model as keyof typeof MINIMAX_MODEL_MAPPING[typeof type]];
  }
  return model; // 如果没有映射，返回原始名称
}

// 错误处理函数 - 根据HTTP状态码和响应内容创建对应错误
export function createMiniMaxError(statusCode: number, response?: unknown): MiniMaxAPIError {
  const responseObj = response as { error?: { code?: string; message?: string } } | undefined;
  const message = responseObj?.error?.message || `HTTP ${statusCode} error`;

  switch (statusCode) {
    case 401:
      return new MiniMaxAPIError(
        MiniMaxErrorCode.INVALID_API_KEY,
        'Invalid API key or authentication failed',
        statusCode,
        response
      );
    case 402:
      return new MiniMaxAPIError(
        MiniMaxErrorCode.INSUFFICIENT_BALANCE,
        'Insufficient account balance',
        statusCode,
        response
      );
    case 429:
      return new MiniMaxAPIError(
        MiniMaxErrorCode.RATE_LIMIT,
        'Rate limit exceeded',
        statusCode,
        response
      );
    case 404:
      return new MiniMaxAPIError(
        MiniMaxErrorCode.MODEL_NOT_FOUND,
        'Model not found',
        statusCode,
        response
      );
    case 400:
      return new MiniMaxAPIError(
        MiniMaxErrorCode.INVALID_REQUEST,
        `Invalid request: ${message}`,
        statusCode,
        response
      );
    case 500:
    case 502:
    case 503:
      return new MiniMaxAPIError(
        MiniMaxErrorCode.SERVER_ERROR,
        `Server error: ${message}`,
        statusCode,
        response
      );
    default:
      return new MiniMaxAPIError(
        MiniMaxErrorCode.NETWORK_ERROR,
        `Network error: ${message}`,
        statusCode,
        response
      );
  }
}

// 获取模型配置
export function getModelConfig(model: string): MiniMaxModelConfig | undefined {
  return MINIMAX_MODEL_CONFIG[model];
}

// 检查模型是否支持特定功能
export function doesModelSupportStreaming(model: string): boolean {
  const config = getModelConfig(model);
  return config?.supportsStreaming ?? false;
}

export function doesModelSupportTools(model: string): boolean {
  const config = getModelConfig(model);
  return config?.supportsTools ?? false;
}

// 获取模型的上下文大小
export function getModelContextSize(model: string): number {
  const config = getModelConfig(model);
  return config?.contextSize ?? 2048;
}