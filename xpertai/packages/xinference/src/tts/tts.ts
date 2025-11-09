import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager'
import { BaseChatModel, BaseChatModelParams } from '@langchain/core/language_models/chat_models'
import { AIMessageChunk, BaseMessage } from '@langchain/core/messages'
import { ChatGenerationChunk, ChatResult } from '@langchain/core/outputs'
import { getEnvironmentVariable } from '@langchain/core/utils/env'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { OpenAI } from "openai";
import { TChatModelOptions, TextToSpeechModel } from '@xpert-ai/plugin-sdk'
import { XinferenceProviderStrategy } from '../provider.strategy.js'
import { createSSEGenerator } from './sse.js'
import { translate } from '../i18n.js'

@Injectable()
export class XinferenceTTSModel extends TextToSpeechModel {
	constructor(modelProvider: XinferenceProviderStrategy) {
		super(modelProvider, AiModelTypeEnum.TTS)
	}
	async validateCredentials(model: string, credentials: Record<string, any>): Promise<void> {
		// No validation for Xinference TTS model
	}

	override getChatModel(copilotModel: ICopilotModel, options?: TChatModelOptions): BaseChatModel {
		if (!options?.modelProperties) {
				throw new Error(
					translate('Error.ModelCredentialsMissing', {model: copilotModel.model})
				)
			}
		const parameters = copilotModel.options || options?.modelProperties

		return new TTSChatModel({
			apiKey: options?.modelProperties.api_key,
			model: copilotModel.model,
			voice: parameters?.voice
		})
	}
}

export interface ChatXinferenceTTSInput extends BaseChatModelParams {
	baseUrl?: string
	/**
	 */
	apiKey?: string
	model: string
	voice: string
}

export class TTSChatModel extends BaseChatModel {
	_llmType(): string {
		return 'xinference-tts'
	}

	protected apiKey: string

	constructor(private fields?: Partial<ChatXinferenceTTSInput>) {
		const apiKey = fields?.apiKey || getEnvironmentVariable('XINFERENCE_API_KEY')
		super({
			...fields
		})

		this.apiKey = apiKey
	}

	async _generate(
		messages: BaseMessage[],
		options: this['ParsedCallOptions'],
		runManager?: CallbackManagerForLLMRun
	): Promise<ChatResult> {
		console.log(messages, options)
		throw new Error('Method not implemented.')
	}

	override async *_streamResponseChunks(
		messages: BaseMessage[],
		options: this["ParsedCallOptions"],
		runManager?: CallbackManagerForLLMRun
	): AsyncGenerator<ChatGenerationChunk> {
		const {signal} = options
		const apiKey = this.apiKey
		const model = this.fields?.model
		const voice = this.fields?.voice

		const url = `${this.fields.baseUrl}/v1/audio/speech`

		const headers = {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
		}

		const text = messages[0].content as string
		const data = {
			model,
			input: {
				text: text,
				voice
			}
		}

		const generator = createSSEGenerator({
			url,
			fetchOptionsBuilder: () => ({
				method: 'POST',
				headers,
				body: JSON.stringify(data)
			}),
			completionCondition: (data) => data.includes('stop'),
			errorCondition: (data) => false ,// data.startsWith('[ERROR]'),
			parseData: (data) => data, //JSON.parse(data.trim()), // optional
			signal
		})

		for await (const event of generator) {
			if (event.type === 'progress') {
				// console.log('🚧 Progress .')
				yield _convertTTSDeltaToBaseMessageChunk(event.output)
			} else if (event.type === 'complete') {
				// console.log('✅ Complete:', event.status, event.result || event.error)
				yield _convertTTSDeltaToBaseMessageChunk(event.result)
				break
			} else if (event.type === 'error') {
				console.error('❌ Error:', event.error)
				break
			}
		}
	}
}

function _convertTTSDeltaToBaseMessageChunk(
  chunk: string
) {
  const message = JSON.parse(chunk);
  return new ChatGenerationChunk({
	text: '',
	message: new AIMessageChunk({
		id: message.output.id,
		content: [
			{
				...message.output.audio,
				type: 'audio',
			}
		],
		usage_metadata: message.usage,
    }),
    // generationInfo,
  });
}

/**
 * Xinference TTS Wrapper
 * For OpenAI-compatible /v1/audio/speech
 */
export interface XinferenceTTSOptions {
  baseURL: string;        // e.g. http://localhost:9997/v1
  apiKey?: string;        // optional
  model: string;          // TTS model name
  voice?: string;         // optional
  format?: "mp3" | "wav" | "flac";
  speed?: number;
}

export class XinferenceTTS {
  private client: OpenAI;
  private model: string;
  private voice?: string;
  private format?: string;
  private speed?: number;

  constructor(options: XinferenceTTSOptions) {
	this.client = new OpenAI({
	  baseURL: options.baseURL,
	  apiKey: options.apiKey ?? "not-required",  // Xinference 兼容模式无需 Key
	});

	this.model = options.model;
	this.voice = options.voice;
	this.format = options.format ?? "mp3";
	this.speed = options.speed;
  }

  /**
   * Generate audio from text
   * return Buffer
   */
  async generate(inputText: string): Promise<Buffer> {
	const response = await this.client.audio.speech.create({
	  model: this.model,
	  input: inputText,
	  voice: this.voice,
	});

	const arrayBuf = await response.arrayBuffer();
	return Buffer.from(arrayBuf);
  }

  /**
   * Generate and return base64
   */
  async generateAsBase64(inputText: string): Promise<string> {
	const response = await this.client.audio.speech.create({
	  model: this.model,
	  input: inputText,
	  voice: this.voice,
	  response_format: this.format as any,  // to bypass type check
	});

	return response as unknown as string;
  }
}
