import { Injectable, Logger } from '@nestjs/common'
import {
  AIModelProviderStrategy,
  CredentialsValidateFailedError,
  ModelProvider,
} from '@xpert-ai/plugin-sdk'
import { AiModelTypeEnum } from '@metad/contracts'
import {
  OpenAIProvider,
  OpenAICredentials,
  toCredentialKwargs,
} from './types.js'

const OpenAIValidationModels = ['gpt-5.4', 'gpt-5', 'gpt-5.2'] as const

const OpenAIValidationFallbackPatterns = [
  'model is not supported',
  'unsupported model',
  'does not exist',
  'unknown model',
  'invalid model',
  'unrecognized model',
  'no such model',
  'not found',
  'not available',
] as const

function shouldRetryWithNextValidationModel(error: unknown): boolean {
  if (!(error instanceof CredentialsValidateFailedError)) {
    return false
  }

  const message = error.message.toLowerCase()
  return OpenAIValidationFallbackPatterns.some((pattern) => message.includes(pattern))
}

@Injectable()
@AIModelProviderStrategy(OpenAIProvider)
export class OpenAIProviderStrategy extends ModelProvider {
  override logger = new Logger(OpenAIProviderStrategy.name)

  getBaseUrl(credentials: OpenAICredentials): string {
    const params = toCredentialKwargs(credentials)
    return params.configuration.baseURL
  }

  getAuthorization(credentials: OpenAICredentials): string {
    return `Bearer ${credentials.api_key}`
  }

  async validateProviderCredentials(credentials: OpenAICredentials): Promise<void> {
    const modelInstance = this.getModelManager(AiModelTypeEnum.LLM)
    let lastError: unknown

    for (const model of OpenAIValidationModels) {
      try {
        await modelInstance.validateCredentials(model, credentials)
        return
      } catch (ex: unknown) {
        lastError = ex

        if (!shouldRetryWithNextValidationModel(ex)) {
          if (ex instanceof CredentialsValidateFailedError) {
            throw ex
          } else {
            this.logger.error(`${this.getProviderSchema().provider}: credentials verification failed`, (ex as any)?.stack)
            throw ex
          }
        }

        this.logger.warn(
          `${this.getProviderSchema().provider}: validation model '${model}' unavailable, trying next candidate`
        )
      }
    }

    if (lastError instanceof CredentialsValidateFailedError) {
      throw lastError
    } else {
      this.logger.error(
        `${this.getProviderSchema().provider}: credentials verification failed`,
        (lastError as any)?.stack
      )
      throw lastError
    }
  }
}
