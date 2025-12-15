import { OpenAIEmbeddings } from '@langchain/openai';
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts';
import { Injectable } from '@nestjs/common';
import {
  CredentialsValidateFailedError,
  getErrorMessage,
  mergeCredentials,
  TextEmbeddingModelManager,
  TChatModelOptions,
} from '@xpert-ai/plugin-sdk';
import { MiniMaxProviderStrategy } from '../provider.strategy.js';
import { 
  MiniMaxModelCredentials, 
  toCredentialKwargs, 
  toOfficialModelName, 
  MINIMAX_MODEL_MAPPING,
  getModelConfig
} from '../types.js';

@Injectable()
export class MiniMaxTextEmbeddingModel extends TextEmbeddingModelManager {
  constructor(modelProvider: MiniMaxProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.TEXT_EMBEDDING);
  }

  getEmbeddingInstance(copilotModel: ICopilotModel, options?: TChatModelOptions) {
    const { copilot } = copilotModel;
    const { modelProvider } = copilot;
    
    const modelCredentials = mergeCredentials(
      modelProvider.credentials,
      options?.modelProperties
    ) as MiniMaxModelCredentials;

    // 转换为官方模型名称
    const modelName = copilotModel.model || copilotModel.copilot.copilotModel?.model || 'embo-01';
    const officialModel = toOfficialModelName(modelName, 'EMBEDDING');
    const modelConfig = getModelConfig(officialModel);
    const params = toCredentialKwargs(modelCredentials, officialModel);

    // 根据模型配置优化批次大小和超时设置
    const optimalBatchSize = Math.min(
      2048, // OpenAI最大批次大小
      modelConfig?.maxTokens || 512, // 模型限制
      512    // MiniMax推荐批次大小
    );

    return new OpenAIEmbeddings({
      ...params,
      model: officialModel,
      batchSize: optimalBatchSize,
      verbose: options?.verbose,
      timeout: 60000, // 60秒超时
      maxRetries: modelCredentials.maxRetries || 3,
    });
  }

  async validateCredentials(
    model: string,
    credentials: MiniMaxModelCredentials
  ): Promise<void> {
    const officialModel = toOfficialModelName(model, 'EMBEDDING');
    
    // 检查模型是否支持
    if (!MiniMaxTextEmbeddingModel.isValidModel(model)) {
      throw new CredentialsValidateFailedError(`Embedding model ${model} is not supported`);
    }

    const params = toCredentialKwargs(credentials, officialModel);
    const modelConfig = getModelConfig(officialModel);

    try {
      const embeddings = new OpenAIEmbeddings({
        ...params,
        model: officialModel,
        batchSize: Math.min(512, modelConfig?.maxTokens || 512), // 根据模型配置调整批次大小
        timeout: 10000, // 验证时使用较短超时
      });

      // 使用简单的测试文本进行验证
      await embeddings.embedQuery('Hello world test');
    } catch (ex) {
      // 尝试从错误中提取更多信息
      const errorMessage = getErrorMessage(ex);
      
      if (errorMessage.includes('401') || errorMessage.includes('unauthorized')) {
        throw new CredentialsValidateFailedError('Invalid API key or authentication failed');
      } else if (errorMessage.includes('404') || errorMessage.includes('not found')) {
        throw new CredentialsValidateFailedError(`Embedding model ${officialModel} not found`);
      } else if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
        throw new CredentialsValidateFailedError('Rate limit exceeded during validation');
      } else {
        throw new CredentialsValidateFailedError(`Embedding validation failed: ${errorMessage}`);
      }
    }
  }

  // 添加模型支持检查
  static getSupportedModels() {
    return Object.keys(MINIMAX_MODEL_MAPPING.EMBEDDING);
  }

  static isValidModel(model: string): boolean {
    return model in MINIMAX_MODEL_MAPPING.EMBEDDING;
  }

  // 获取模型详细信息
  getModelInfo(model: string) {
    const officialModel = toOfficialModelName(model, 'EMBEDDING');
    const config = getModelConfig(officialModel);
    
    return {
      model: officialModel,
      originalModel: model,
      contextSize: config?.contextSize || 2048,
      maxTokens: config?.maxTokens || 2048,
      maxBatchSize: Math.min(2048, config?.contextSize || 2048),
      dimension: this.getEmbeddingDimension(officialModel),
      pricing: config?.pricing,
    };
  }

  // 获取embedding维度
  private getEmbeddingDimension(model: string): number {
    // 根据模型返回对应的embedding维度
    switch (model) {
      case 'embo-01':
        return 1536; // 与OpenAI text-embedding-ada-002相同
      case 'text-embedding-ada-002':
        return 1536;
      default:
        return 1536; // 默认维度
    }
  }

  // 获取模型的参数规则
  getModelParameters(model: string) {
    const officialModel = toOfficialModelName(model, 'EMBEDDING');
    const config = getModelConfig(officialModel);
    
    return {
      batch_size: {
        type: 'integer',
        min: 1,
        max: Math.min(2048, config?.contextSize || 2048),
        default: Math.min(512, config?.contextSize || 2048),
        description: 'Number of texts to embed in each batch'
      },
      max_tokens: {
        type: 'integer',
        min: 1,
        max: config?.contextSize || 2048,
        default: config?.maxTokens || 2048,
        description: 'Maximum tokens per text to embed'
      }
    };
  }

  // 批量embeddings增强版本
  async embedBatch(
    texts: string[],
    model: string,
    credentials: MiniMaxModelCredentials,
    options?: TChatModelOptions
  ): Promise<number[][]> {
    if (!MiniMaxTextEmbeddingModel.isValidModel(model)) {
      throw new Error(`Embedding model ${model} is not supported`);
    }

    if (texts.length === 0) {
      return [];
    }

    try {
      const embeddingInstance = this.getEmbeddingInstance({
        model,
        copilot: {
          role: 'model' as const, // 添加必需的role属性
          modelProvider: {
            provider: 'minimax' as unknown, // 类型转换
            credentials,
          },
          copilotModel: {
            model,
            options: {},
          },
        },
      } as unknown as ICopilotModel, options);

      // 分批处理大量文本
      const modelInfo = this.getModelInfo(model);
      const batchSize = Math.min(texts.length, modelInfo.maxBatchSize);
      const results: number[][] = [];

      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const batchResults = await embeddingInstance.embedDocuments(batch);
        results.push(...batchResults);
      }

      return results;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      throw new Error(`Batch embedding failed: ${errorMessage}`);
    }
  }
}