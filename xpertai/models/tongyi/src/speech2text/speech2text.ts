import { BaseChatModel, BaseChatModelParams } from '@langchain/core/language_models/chat_models'
import { AIMessage, BaseMessage } from '@langchain/core/messages'
import { ChatResult } from '@langchain/core/outputs'
import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { SpeechToTextModel, TChatModelOptions } from '@xpert-ai/plugin-sdk'
import { TongyiProviderStrategy } from '../provider.strategy.js'

@Injectable()
export class TongyiSpeech2TextModel extends SpeechToTextModel {
	constructor(override readonly modelProvider: TongyiProviderStrategy) {
		super(modelProvider, AiModelTypeEnum.SPEECH2TEXT)
	}

	override validateCredentials(model: string, credentials: Record<string, any>): Promise<void> {
		throw new Error('Method not implemented.')
	}

	override getChatModel(copilotModel: ICopilotModel, options?: TChatModelOptions): BaseChatModel {
		return new Speech2TextChatModel({
			apiKey: (copilotModel.copilot.modelProvider.credentials as { dashscope_api_key: string }).dashscope_api_key,
			model: copilotModel.model
		})
	}
}

export interface ChatTongyiSpeech2TextInput extends BaseChatModelParams {
	apiKey?: string
	model: string
}

export class Speech2TextChatModel extends BaseChatModel {
	_llmType(): string {
		return 'tongyi-speech2text'
	}

	protected apiKey: string

	constructor(private fields?: Partial<ChatTongyiSpeech2TextInput>) {
		const apiKey = fields?.apiKey
		if (!apiKey) {
			throw new Error('Tongyi API key is required for Speech2Text.')
		}
		super({ ...fields })
		this.apiKey = apiKey
	}

	async _generate(
		messages: BaseMessage[],
		options: this['ParsedCallOptions'],
		runManager?: CallbackManagerForLLMRun
	): Promise<ChatResult> {
		const humanMessage = messages[messages.length - 1]
		const fileUrls = (<{ url: string }[]>humanMessage.content).map((_) => _.url)
		const languageHints = ['zh', 'en']

		const taskId = await submitTask(this.apiKey, fileUrls, languageHints)
		if (taskId) {
			const result = await waitForComplete(taskId, this.apiKey)
			const content = await processTranscriptions(result)
			return {
				generations: content.map((text) => ({
					text,
					message: new AIMessage({ content: text })
				}))
			}
		}

		return { generations: [] }
	}
}

async function submitTask(apiKey: string, fileUrls: string[], languageHints: string[]): Promise<string | null> {
	const serviceUrl = 'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription'
	const response = await fetch(serviceUrl, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
			'X-DashScope-Async': 'enable'
		},
		body: JSON.stringify({
			model: 'paraformer-v2',
			input: { file_urls: fileUrls },
			parameters: {
				channel_id: [0],
				language_hints: languageHints
			}
		})
	})

	if (!response.ok) {
		const errorText = await response.text()
		throw new Error(`Failed to submit transcription task: ${errorText}`)
	}

	const data = await response.json() as { output: { task_id: string } }
	return data.output.task_id
}

async function waitForComplete(taskId: string, apiKey: string): Promise<{ transcription_url: string }[]> {
	const serviceUrl = `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`
	const headers = {
		Authorization: `Bearer ${apiKey}`,
		'Content-Type': 'application/json',
		'X-DashScope-Async': 'enable'
	}

	return new Promise((resolve, reject) => {
		const poll = async () => {
			try {
				const response = await fetch(serviceUrl, { method: 'POST', headers, body: '{}' })
				const data = await response.json() as { output: { task_status: string; results?: { transcription_url: string }[]; message?: string } }
				const status = data.output.task_status

				if (status === 'SUCCEEDED') {
					resolve(data.output.results ?? [])
				} else if (status === 'RUNNING' || status === 'PENDING') {
					setTimeout(poll, 300)
				} else {
					reject(new Error(data.output.message || 'Task failed'))
				}
			} catch (error) {
				reject(error)
			}
		}
		poll()
	})
}

async function processTranscriptions(results: { transcription_url: string }[]): Promise<string[]> {
	const texts: string[] = []
	for (const result of results) {
		const response = await fetch(result.transcription_url)
		const data = await response.json() as {
			transcripts: { sentences: { text: string }[] }[]
		}
		const allSentences: string[] = []
		for (const transcript of data.transcripts) {
			for (const sentence of transcript.sentences) {
				allSentences.push(sentence.text)
			}
		}
		texts.push(allSentences.join(' '))
	}
	return texts
}
