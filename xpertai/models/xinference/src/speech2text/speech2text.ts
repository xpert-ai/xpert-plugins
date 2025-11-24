import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import {
  BaseChatModel,
  BaseChatModelParams,
} from '@langchain/core/language_models/chat_models';
import { AIMessage, BaseMessage } from '@langchain/core/messages';
import { ChatResult } from '@langchain/core/outputs';
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts';
import { Injectable } from '@nestjs/common';
import {
  Speech2TextChatModel,
  SpeechToTextModel,
  TChatModelOptions,
} from '@xpert-ai/plugin-sdk';
import fs from 'fs';
import { OpenAI } from 'openai';
import { XinferenceProviderStrategy } from '../provider.strategy.js';

@Injectable()
export class XinferenceSpeech2TextModel extends SpeechToTextModel {
  constructor(modelProvider: XinferenceProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.SPEECH2TEXT);
  }

  async validateCredentials(
    model: string,
    credentials: Record<string, any>
  ): Promise<void> {
    // No specific validation for Xinference speech-to-text credentials
  }

  override getChatModel(
    copilotModel: ICopilotModel,
    options?: TChatModelOptions
  ): BaseChatModel {
    return new Speech2TextChatModel({
      apiKey: copilotModel.copilot.modelProvider.credentials.dashscope_api_key,
      model: copilotModel.model,
    });
  }
}

export interface ChatXinferenceSpeech2TextInput extends BaseChatModelParams {
  baseURL: string; // e.g. http://localhost:9997/v1
  /**
   */
  apiKey?: string;
  model: string;
  language?: string; // optional, e.g. "zh"
  temperature?: number; // optional
}

export class XinferenceSpeech2TextChatModel extends BaseChatModel {
  _llmType(): string {
    return 'xinference-speech2text';
  }

  private client: OpenAI;
  protected apiKey: string;
  private model: string;
  private language?: string;
  private temperature?: number;

  constructor(private fields?: Partial<ChatXinferenceSpeech2TextInput>) {
    const apiKey = fields?.apiKey;
    super({
      ...fields,
    });

    this.apiKey = apiKey;

    this.client = new OpenAI({
      baseURL: fields.baseURL,
      apiKey: fields.apiKey ?? 'not-required',
    });

    this.model = fields.model;
    this.language = fields.language;
    this.temperature = fields.temperature;
  }

  async _generate(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun
  ): Promise<ChatResult> {
    const humanMessage = messages[messages.length - 1];

    const fileUrls = (<{ url: string }[]>humanMessage.content).map(
      (_) => _.url
    );
    const languageHints = ['zh', 'en'];

    if (fileUrls.length > 1) {
      throw new Error(
        'XinferenceSpeech2TextChatModel currently only supports one audio file at a time.'
      );
    }
    const url = fileUrls[0];
    // get Buffer from url
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const transcription = await this.transcribeBuffer(buffer);

    return {
      generations: [
        {
          text: transcription,
          message: new AIMessage({
            content: transcription,
          }),
        },
      ],
    };
  }

  /**
   * Convert audio file to text
   * @param filePath path to audio file
   * @returns text
   */
  async transcribeFile(filePath: string): Promise<string> {
    const file = fs.createReadStream(filePath);

    const response = await this.client.audio.transcriptions.create({
      file,
      model: this.model,
      language: this.language,
      temperature: this.temperature,
    });

    return response.text;
  }

  /**
   * Transcribe from buffer
   */
  async transcribeBuffer(
    buffer: Buffer,
    filename = 'audio.wav'
  ): Promise<string> {
    const blob = new Blob([buffer]);

    const response = await this.client.audio.transcriptions.create({
      file: new File([blob], filename),
      model: this.model,
      language: this.language,
      temperature: this.temperature,
    });

    return response.text;
  }
}
