import {
  AiModelTypeEnum,
  ICopilotModel
} from '@metad/contracts'
import { Injectable } from '@nestjs/common';
import {
  ChatOAICompatReasoningModel,
  CredentialsValidateFailedError,
  getErrorMessage,
  LargeLanguageModel,
  mergeCredentials,
  TChatModelOptions,
} from '@xpert-ai/plugin-sdk';
import { MiniMaxProviderStrategy } from '../provider.strategy.js';
import { 
  MiniMaxModelCredentials, 
  toCredentialKwargs, 
  toOfficialModelName, 
  MINIMAX_MODEL_MAPPING,
  getModelConfig,
  doesModelSupportStreaming,
  doesModelSupportTools,
  MiniMaxModelConfig,
  MiniMaxAPIError
} from '../types.js';

@Injectable()
export class MiniMaxLargeLanguageModel extends LargeLanguageModel {
  constructor(modelProvider: MiniMaxProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.LLM);
  }

  async validateCredentials(
    model: string,
    credentials: MiniMaxModelCredentials
  ): Promise<void> {
    const officialModel = toOfficialModelName(model, 'LLM');
    
    // 检查模型是否支持
    if (!MiniMaxLargeLanguageModel.isValidModel(model)) {
      throw new CredentialsValidateFailedError(`Model ${model} is not supported`);
    }

    const params = toCredentialKwargs(credentials, officialModel);
    const modelConfig = getModelConfig(officialModel);

    try {
      const chatModel = this.createChatModel({
        ...params,
        temperature: 0,
        maxTokens: Math.min(5, modelConfig?.maxTokens || 2048),
        // 设置较小的超时时间用于验证
        timeout: 10000
      });

      await chatModel.invoke([
        {
          role: 'human',
          content: 'Hi'
        }
      ]);
    } catch (err) {
      if (err instanceof MiniMaxAPIError) {
        throw new CredentialsValidateFailedError(err.message);
      }
      
      // 尝试从错误中提取更多信息
      const errorMessage = getErrorMessage(err);
      
      if (errorMessage.includes('401') || errorMessage.includes('unauthorized')) {
        throw new CredentialsValidateFailedError('Invalid API key or authentication failed');
      } else if (errorMessage.includes('404') || errorMessage.includes('not found')) {
        throw new CredentialsValidateFailedError(`Model ${officialModel} not found`);
      } else if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
        throw new CredentialsValidateFailedError('Rate limit exceeded during validation');
      } else {
        throw new CredentialsValidateFailedError(`Validation failed: ${errorMessage}`);
      }
    }
  }

  protected createChatModel(params: object) {
    return new ChatOAICompatReasoningModel(params);
  }

  override getChatModel(
    copilotModel: ICopilotModel,
    options?: TChatModelOptions
  ) {
    const { handleLLMTokens } = options ?? {};
    const { copilot } = copilotModel;
    const { modelProvider } = copilot;

    const modelCredentials = mergeCredentials(
      modelProvider.credentials,
      options?.modelProperties
    );

    // 转换为官方模型名称
    const officialModel = toOfficialModelName(copilotModel.model, 'LLM');
    const modelConfig = getModelConfig(officialModel);

    // 验证模型支持的功能
    const streaming = copilotModel.options?.['streaming'] ?? true;
    const supportsStreaming = doesModelSupportStreaming(officialModel);
    
    if (streaming && !supportsStreaming) {
      this.logger.warn(`Model ${officialModel} does not support streaming, falling back to non-streaming`);
    }

    // 根据模型配置设置合理的参数限制
    const temperature = this.validateTemperature(copilotModel.options?.['temperature'], officialModel);
    const maxTokens = this.validateMaxTokens(
      copilotModel.options?.['max_tokens'],
      officialModel,
      modelConfig
    );
    
    const params = toCredentialKwargs(modelCredentials, officialModel);
    
    return this.createChatModel({
      ...params,
      model: officialModel,
      streaming: streaming && supportsStreaming,
      temperature,
      maxTokens,
      streamUsage: false,
      verbose: options?.verbose,
      // 增加重试和超时配置
      maxRetries: modelCredentials.maxRetries || 3,
      timeout: 60000, // 60秒超时
      callbacks: [...this.createHandleUsageCallbacks(copilot, officialModel, modelCredentials, handleLLMTokens)]
    });
  }

  canSteaming(model: string): boolean {
    const officialModel = toOfficialModelName(model, 'LLM');
    return doesModelSupportStreaming(officialModel);
  }

  // 验证温度参数
  private validateTemperature(temperature?: number, model?: string): number {
    const temp = temperature ?? 0;
    
    // 大多数MiniMax模型的温度范围是0-2
    if (temp < 0 || temp > 2) {
      this.logger.warn(`Temperature ${temp} is outside recommended range [0, 2] for model ${model}`);
      return Math.max(0, Math.min(2, temp));
    }
    
    return temp;
  }

  // 验证最大token数
  private validateMaxTokens(
    maxTokens?: number,
    model?: string,
    modelConfig?: MiniMaxModelConfig
  ): number {
    if (!maxTokens) {
      return modelConfig?.maxTokens || 2048;
    }

    const contextSize = modelConfig?.contextSize || 2048;
    const recommendedMax = modelConfig?.maxTokens || contextSize;
    
    if (maxTokens > contextSize) {
      this.logger.warn(
        `maxTokens ${maxTokens} exceeds context size ${contextSize} for model ${model}, using ${recommendedMax}`
      );
      return recommendedMax;
    }
    
    if (maxTokens < 1) {
      this.logger.warn(`maxTokens ${maxTokens} is too small, using 1`);
      return 1;
    }
    
    return maxTokens;
  }

  // 添加模型支持检查
  static getSupportedModels() {
    return Object.keys(MINIMAX_MODEL_MAPPING.LLM);
  }

  static isValidModel(model: string): boolean {
    return model in MINIMAX_MODEL_MAPPING.LLM;
  }

  // 获取模型详细信息
  getModelInfo(model: string) {
    const officialModel = toOfficialModelName(model, 'LLM');
    const config = getModelConfig(officialModel);
    
    return {
      model: officialModel,
      originalModel: model,
      contextSize: config?.contextSize || 2048,
      maxTokens: config?.maxTokens,
      supportsStreaming: config?.supportsStreaming ?? false,
      supportsTools: config?.supportsTools ?? false,
      pricing: config?.pricing,
      capabilities: {
        vision: false, // MiniMax目前不支持视觉功能
        tools: config?.supportsTools ?? false,
        streaming: config?.supportsStreaming ?? false,
      }
    };
  }

  // 获取模型的参数规则
  getModelParameters(model: string) {
    const officialModel = toOfficialModelName(model, 'LLM');
    const config = getModelConfig(officialModel);
    
    const baseParams = {
      temperature: {
        type: 'number',
        min: 0,
        max: 2,
        default: 0,
        description: 'Controls randomness in the output'
      },
      max_tokens: {
        type: 'integer',
        min: 1,
        max: config?.contextSize || 2048,
        default: config?.maxTokens || 2048,
        description: 'Maximum number of tokens to generate'
      },
      top_p: {
        type: 'number',
        min: 0.01,
        max: 1,
        default: 0.9,
        description: 'Nucleus sampling parameter'
      }
    };

    // 根据模型类型添加特定参数
    if (doesModelSupportTools(officialModel)) {
      return {
        ...baseParams,
        tools: {
          type: 'array',
          description: 'List of tools the model may call'
        },
        tool_choice: {
          type: 'string',
          enum: ['auto', 'none', 'required'],
          default: 'auto',
          description: 'Controls when the model calls functions'
        }
      };
    }

    return baseParams;
  }
}