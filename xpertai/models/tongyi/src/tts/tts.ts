import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager'
import { BaseChatModel, BaseChatModelParams } from '@langchain/core/language_models/chat_models'
import { AIMessageChunk, BaseMessage } from '@langchain/core/messages'
import { ChatGenerationChunk, ChatResult } from '@langchain/core/outputs'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { TextToSpeechModel, TChatModelOptions } from '@xpert-ai/plugin-sdk'
import { TongyiProviderStrategy } from '../provider.strategy.js'

@Injectable()
export class TongyiTTSModel extends TextToSpeechModel {
	constructor(override readonly modelProvider: TongyiProviderStrategy) {
		super(modelProvider, AiModelTypeEnum.TTS)
	}

	override validateCredentials(model: string, credentials: Record<string, any>): Promise<void> {
		throw new Error('Method not implemented.')
	}

	override getChatModel(copilotModel: ICopilotModel, options?: TChatModelOptions): BaseChatModel {
		const parameters = copilotModel.options || options?.modelProperties
		return new TTSChatModel({
			apiKey: (copilotModel.copilot.modelProvider.credentials as { dashscope_api_key: string }).dashscope_api_key,
			model: copilotModel.model,
			voice: parameters?.voice
		})
	}
}

export interface ChatTongyiTTSInput extends BaseChatModelParams {
	apiKey?: string
	model: string
	voice: string
}

export class TTSChatModel extends BaseChatModel {
	_llmType(): string {
		return 'tongyi-tts'
	}

	protected apiKey: string

	constructor(private fields?: Partial<ChatTongyiTTSInput>) {
		const apiKey = fields?.apiKey
		if (!apiKey) {
			throw new Error('Tongyi API key is required for TTS.')
		}
		super({ ...fields })
		this.apiKey = apiKey
	}

	override async _generate(
		messages: BaseMessage[],
		options: this['ParsedCallOptions'],
		runManager?: CallbackManagerForLLMRun
	): Promise<ChatResult> {
		throw new Error('Use streaming mode for Tongyi TTS.')
	}

	override async *_streamResponseChunks(
		messages: BaseMessage[],
		options: this['ParsedCallOptions'],
		runManager?: CallbackManagerForLLMRun
	): AsyncGenerator<ChatGenerationChunk> {
		const { signal } = options
		const model = this.fields?.model || 'qwen-tts'
		const voice = this.fields?.voice

		const url = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'
		const headers: Record<string, string> = {
			Authorization: `Bearer ${this.apiKey}`,
			'Content-Type': 'application/json',
			'X-DashScope-SSE': 'enable'
		}

		const text = messages[0].content as string
		const data = {
			model,
			input: { text, voice }
		}

		const response = await fetch(url, {
			method: 'POST',
			headers,
			body: JSON.stringify(data),
			signal
		})

		if (!response.ok) {
			const errorText = await response.text()
			throw new Error(`Tongyi TTS request failed: ${response.status} ${errorText}`)
		}

		const reader = response.body?.getReader()
		if (!reader) throw new Error('Failed to get response reader')

		const decoder = new TextDecoder()
		let buffer = ''

		try {
			while (true) {
				const { done, value } = await reader.read()
				if (done) break
				buffer += decoder.decode(value, { stream: true })

				const lines = buffer.split('\n')
				buffer = lines.pop() || ''

				for (const line of lines) {
					const trimmed = line.trim()
					if (!trimmed || !trimmed.startsWith('data:')) continue
					const jsonStr = trimmed.slice(5).trim()
					if (!jsonStr || jsonStr === '[DONE]') continue

					try {
						const message = JSON.parse(jsonStr)
						if (message.output) {
							yield new ChatGenerationChunk({
								text: '',
								message: new AIMessageChunk({
									id: message.output.id,
									content: [
										{
											...message.output.audio,
											type: 'audio'
										}
									],
									usage_metadata: message.usage
								})
							})

							if (message.output.finish_reason === 'stop') return
						}
					} catch {
						// skip invalid JSON chunks
					}
				}
			}
		} finally {
			reader.releaseLock()
		}
	}
}
