import { Injectable } from '@nestjs/common';
import { AiModelTypeEnum } from '@metad/contracts';
import {
  CredentialsValidateFailedError,
  mergeCredentials,
  SpeechToTextModel,
  TChatModelOptions
} from '@xpert-ai/plugin-sdk';
import { MiniMaxProviderStrategy } from '../provider.strategy.js';
import { MiniMaxModelCredentials, SUPPORTED_TTS_MODELS, toCredentialKwargs } from '../types.js';

export interface MiniMaxTTSOptions {
  voice?: string;
  speed?: number;
  format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav';
  language?: string;
}

export interface MiniMaxTTSResponse {
  audioData: ArrayBuffer;
  contentType: string;
}

@Injectable()
export class MiniMaxTTSModel extends SpeechToTextModel {
  constructor(modelProvider: MiniMaxProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.SPEECH2TEXT);
  }

  async synthesizeSpeech(
    model: string,
    text: string,
    credentials: MiniMaxModelCredentials,
    options?: MiniMaxTTSOptions
  ): Promise<MiniMaxTTSResponse> {
    const params = toCredentialKwargs(credentials, model);
    const payload = {
      model,
      input: text,
      voice: options?.voice ?? 'alloy',
      response_format: options?.format ?? 'mp3',
      speed: options?.speed ?? 1.0,
      language: options?.language ?? 'zh'
    };

    const response = await fetch(`${params.configuration.baseURL}/audio/speech`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MiniMax TTS request failed: ${response.status} ${errorText}`);
    }

    const audioData = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'audio/mpeg';

    return { audioData, contentType };
  }

  getTTSInstance(model: string, credentials: MiniMaxModelCredentials, options?: TChatModelOptions) {
    const merged = mergeCredentials(credentials, options?.modelProperties) as MiniMaxModelCredentials;
    return {
      model,
      synthesizeSpeech: (text: string, ttsOptions?: MiniMaxTTSOptions) =>
        this.synthesizeSpeech(model, text, merged, ttsOptions)
    };
  }

  async validateCredentials(model: string, credentials: MiniMaxModelCredentials): Promise<void> {
    if (!model || !SUPPORTED_TTS_MODELS.includes(model)) {
      throw new CredentialsValidateFailedError(`TTS model ${model} is not supported`);
    }
    if (!credentials.api_key) {
      throw new CredentialsValidateFailedError('API key is required');
    }
  }

  static getSupportedModels() {
    return SUPPORTED_TTS_MODELS;
  }
}