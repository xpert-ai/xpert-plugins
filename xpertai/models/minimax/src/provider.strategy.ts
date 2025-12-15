import { Injectable } from '@nestjs/common';
import { AIModelProviderStrategy, CredentialsValidateFailedError, ModelProvider } from '@xpert-ai/plugin-sdk';
import { MiniMax, MiniMaxCredentials, MiniMaxAPIError } from './types.js';
import { AiModelTypeEnum } from '@metad/contracts';

@Injectable()
@AIModelProviderStrategy(MiniMax)
export class MiniMaxProviderStrategy extends ModelProvider {

  getBaseUrl(credentials: MiniMaxCredentials): string {
    return credentials.base_url || 'https://api.minimaxi.com/v1';
  }

  getAuthorization(credentials: MiniMaxCredentials): string {
    return `Bearer ${credentials.api_key}`;
  }

  async validateProviderCredentials(credentials: MiniMaxCredentials): Promise<void> {
    try {
      // 首先验证凭证格式
      if (!credentials.api_key || typeof credentials.api_key !== 'string') {
        throw new CredentialsValidateFailedError('API key is required and must be a string');
      }

      // 验证base_url格式
      if (credentials.base_url) {
        try {
          new URL(credentials.base_url);
        } catch {
          throw new CredentialsValidateFailedError('Invalid base URL format');
        }
      }

      // 尝试使用LLM模型进行验证
      const modelInstance = this.getModelManager(AiModelTypeEnum.LLM);
      await modelInstance.validateCredentials('MiniMax-M2', credentials);

      // 如果可能，也可以验证其他模型类型
      try {
        const embeddingInstance = this.getModelManager(AiModelTypeEnum.TEXT_EMBEDDING);
        await embeddingInstance.validateCredentials('embo-01', credentials);
      } catch (embeddingError) {
        this.logger.warn(`Embedding model validation failed, but LLM validation succeeded: ${embeddingError}`);
        // 不抛出错误，因为LLM验证已成功
      }

    } catch (ex: unknown) {
      if (ex instanceof CredentialsValidateFailedError) {
        throw ex;
      } else if (ex instanceof MiniMaxAPIError) {
        throw new CredentialsValidateFailedError(ex.message);
      } else if (ex instanceof Error) {
        this.logger.error(
          `${this.getProviderSchema().provider}: credentials verification failed: ${ex.message}`,
          ex.stack
        );
        throw new CredentialsValidateFailedError(`Provider validation failed: ${ex.message}`);
      } else {
        this.logger.error(
          `${this.getProviderSchema().provider}: credentials verification failed with unknown error`,
          ex
        );
        throw new CredentialsValidateFailedError('Unknown validation error occurred');
      }
    }
  }
}