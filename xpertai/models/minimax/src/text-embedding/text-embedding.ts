import { Injectable } from '@nestjs/common';
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts';
import { Embeddings } from '@langchain/core/embeddings';
import {
  CredentialsValidateFailedError,
  getErrorMessage,
  mergeCredentials,
  TextEmbeddingModelManager,
  TChatModelOptions
} from '@xpert-ai/plugin-sdk';
import { MiniMaxProviderStrategy } from '../provider.strategy.js';
import { MiniMaxModelCredentials, SUPPORTED_EMBEDDING_MODELS, toCredentialKwargs } from '../types.js';

interface MiniMaxEmbeddingResponse {
  vectors?: number[][];
  total_tokens?: number;
  base_resp?: {
    status_code: number;
    status_msg?: string;
  };
}

/**
 * Custom Embeddings implementation for MiniMax
 * MiniMax uses a different API format than OpenAI standard
 */
class MiniMaxEmbeddings extends Embeddings {
  private apiKey: string;
  private groupId: string;
  private baseURL: string;
  private model: string;

  constructor(params: {
    apiKey: string;
    groupId: string;
    baseURL: string;
    model: string;
  }) {
    super({});
    this.apiKey = params.apiKey;
    this.groupId = params.groupId;
    this.baseURL = params.baseURL;
    this.model = params.model;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    // Remove /v1 from baseURL if present, then add it back
    const baseURL = this.baseURL.replace(/\/v1$/, '').replace(/\/$/, '');
    const url = `${baseURL}/v1/embeddings?GroupId=${this.groupId}`;
    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
    const data = {
      model: this.model,
      texts: texts,
      type: 'db', // document type
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MiniMax embedding API error: ${response.status} ${errorText}`);
    }

    const result = (await response.json()) as MiniMaxEmbeddingResponse;
    if (result.base_resp?.status_code !== 0) {
      const code = result.base_resp?.status_code;
      const msg = result.base_resp?.status_msg || 'Unknown error';
      throw new Error(`MiniMax embedding API error: ${code} ${msg}`);
    }

    return result.vectors || [];
  }

  async embedQuery(text: string): Promise<number[]> {
    // Remove /v1 from baseURL if present, then add it back
    const baseURL = this.baseURL.replace(/\/v1$/, '').replace(/\/$/, '');
    const url = `${baseURL}/v1/embeddings?GroupId=${this.groupId}`;
    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
    const data = {
      model: this.model,
      texts: [text],
      type: 'query', // query type
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MiniMax embedding API error: ${response.status} ${errorText}`);
    }

    const result = (await response.json()) as MiniMaxEmbeddingResponse;
    if (result.base_resp?.status_code !== 0) {
      const code = result.base_resp?.status_code;
      const msg = result.base_resp?.status_msg || 'Unknown error';
      throw new Error(`MiniMax embedding API error: ${code} ${msg}`);
    }

    const vectors = result.vectors || [];
    return vectors[0] || [];
  }
}

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
    const model = copilotModel.model ?? 'embo-01';
    const params = toCredentialKwargs(modelCredentials, model);

    return new MiniMaxEmbeddings({
      apiKey: params.apiKey,
      groupId: params.groupId,
      baseURL: params.configuration.baseURL,
      model,
    });
  }

  async validateCredentials(model: string, credentials: MiniMaxModelCredentials): Promise<void> {
    if (!model || !SUPPORTED_EMBEDDING_MODELS.includes(model)) {
      throw new CredentialsValidateFailedError(`Embedding model ${model} is not supported`);
    }
    if (!credentials.api_key) {
      throw new CredentialsValidateFailedError('API key is required');
    }
    if (!credentials.group_id) {
      throw new CredentialsValidateFailedError('Group ID is required');
    }

    // Try to validate by making a test call
    try {
      const params = toCredentialKwargs(credentials, model);
      const embeddings = new MiniMaxEmbeddings({
        apiKey: params.apiKey,
        groupId: params.groupId,
        baseURL: params.configuration.baseURL,
        model,
      });
      await embeddings.embedQuery('ping');
    } catch (ex) {
      throw new CredentialsValidateFailedError(getErrorMessage(ex));
    }
  }

  static getSupportedModels() {
    return SUPPORTED_EMBEDDING_MODELS;
  }
}