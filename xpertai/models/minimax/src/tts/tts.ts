import { AiModelTypeEnum } from '@metad/contracts';
import { Injectable } from '@nestjs/common';
import {
  CredentialsValidateFailedError,
  getErrorMessage,
  mergeCredentials,
  SpeechToTextModel,
  TChatModelOptions,
} from '@xpert-ai/plugin-sdk';
import { MiniMaxProviderStrategy } from '../provider.strategy.js';
import { 
  MiniMaxModelCredentials, 
  toCredentialKwargs, 
  toOfficialModelName, 
  MINIMAX_MODEL_MAPPING,
  createMiniMaxError,
  MiniMaxAPIError,
  getModelConfig,
  MiniMaxErrorCode
} from '../types.js';

// TTS选项接口
export interface MiniMaxTTSOptions {
  voice?: string;
  speed?: number;
  format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav';
  language?: string;
}

// TTS响应接口
export interface MiniMaxTTSResponse {
  audioData: ArrayBuffer;
  contentType: string;
  duration?: number;
}

@Injectable()
export class MiniMaxTTSModel extends SpeechToTextModel {
  constructor(modelProvider: MiniMaxProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.SPEECH2TEXT);
  }

  async validateCredentials(
    model: string,
    credentials: MiniMaxModelCredentials
  ): Promise<void> {
    try {
      const officialModel = toOfficialModelName(model, 'TTS');
      const params = toCredentialKwargs(credentials, officialModel);

      // 使用最小化参数进行凭证验证
      const testPayload = {
        model: officialModel,
        input: 'hello',
        voice: 'alloy',
        response_format: 'mp3'
      };

      const response = await fetch(`${params.configuration.baseURL}/audio/speech`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${params.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testPayload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw createMiniMaxError(response.status, errorData);
      }
    } catch (err) {
      if (err instanceof MiniMaxAPIError) {
        throw new CredentialsValidateFailedError(err.message);
      }
      throw new CredentialsValidateFailedError(getErrorMessage(err));
    }
  }

  // 文本转语音核心方法
  async synthesizeSpeech(
    model: string,
    text: string,
    credentials: MiniMaxModelCredentials,
    options?: MiniMaxTTSOptions
  ): Promise<MiniMaxTTSResponse> {
    try {
      const officialModel = toOfficialModelName(model, 'TTS');
      const modelConfig = getModelConfig(officialModel);
      
      if (!modelConfig) {
        throw new MiniMaxAPIError(
          MiniMaxErrorCode.MODEL_NOT_FOUND,
          `Model ${officialModel} not found or not supported`
        );
      }

      const params = toCredentialKwargs(credentials, officialModel);
      
      // 构建TTS请求载荷
      const payload = {
        model: officialModel,
        input: text,
        voice: options?.voice || this.getDefaultVoice(officialModel),
        response_format: options?.format || 'mp3',
        speed: options?.speed || 1.0,
        language: options?.language || 'zh', // 默认中文
      };

      const response = await fetch(`${params.configuration.baseURL}/audio/speech`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${params.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw createMiniMaxError(response.status, errorData);
      }

      // 获取音频数据
      const audioData = await response.arrayBuffer();
      const contentType = response.headers.get('content-type') || 'audio/mpeg';

      return {
        audioData,
        contentType,
        // 可以根据需要计算音频时长
      };

    } catch (err) {
      if (err instanceof MiniMaxAPIError) {
        throw err;
      }
      throw new MiniMaxAPIError(
        MiniMaxErrorCode.NETWORK_ERROR,
        `Network error during speech synthesis: ${getErrorMessage(err)}`
      );
    }
  }

  // 获取默认声音
  private getDefaultVoice(model: string): string {
    // 根据模型类型返回合适的默认声音
    if (model.includes('hd')) {
      return 'nova'; // HD模型使用高质量声音
    }
    return 'alloy'; // 默认声音
  }

  // 获取支持的声音列表
  getSupportedVoices(model: string): string[] {
    const officialModel = toOfficialModelName(model, 'TTS');
    
    // 根据模型类型返回不同的声音选项
    if (officialModel.includes('02')) {
      // speech-02 系列支持更多声音
      return ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'zh-CN-XiaoxiaoNeural', 'zh-CN-YunxiNeural'];
    } else {
      // speech-01 系列
      return ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
    }
  }

  // 获取模型实例 - 为SDK提供的接口
  getTTSInstance(model: string, credentials: MiniMaxModelCredentials, options?: TChatModelOptions) {
    const officialModel = toOfficialModelName(model, 'TTS');
    const modelCredentials = mergeCredentials(
      credentials,
      options?.modelProperties
    ) as MiniMaxModelCredentials;

    return {
      model: officialModel,
      synthesizeSpeech: (text: string, ttsOptions?: MiniMaxTTSOptions) =>
        this.synthesizeSpeech(officialModel, text, modelCredentials, ttsOptions),
      getSupportedVoices: () => this.getSupportedVoices(officialModel),
      validateCredentials: () => this.validateCredentials(officialModel, modelCredentials),
      modelConfig: getModelConfig(officialModel),
    };
  }

  // 模型支持检查
  static getSupportedModels() {
    return Object.keys(MINIMAX_MODEL_MAPPING.TTS);
  }

  static isValidModel(model: string): boolean {
    return model in MINIMAX_MODEL_MAPPING.TTS;
  }

  // 获取模型参数规则
  getModelParameters(model: string) {
    const officialModel = toOfficialModelName(model, 'TTS');
    
    return {
      voice: {
        type: 'string',
        enum: this.getSupportedVoices(officialModel),
        default: this.getDefaultVoice(officialModel),
        description: 'Voice for speech synthesis'
      },
      speed: {
        type: 'number',
        min: 0.25,
        max: 4.0,
        default: 1.0,
        description: 'Speed of speech synthesis'
      },
      format: {
        type: 'string',
        enum: ['mp3', 'opus', 'aac', 'flac', 'wav'],
        default: 'mp3',
        description: 'Audio format'
      },
      language: {
        type: 'string',
        enum: ['zh', 'en', 'ja', 'ko'],
        default: 'zh',
        description: 'Language of the text'
      }
    };
  }
}