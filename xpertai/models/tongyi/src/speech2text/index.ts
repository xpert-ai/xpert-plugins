import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager'
import { BaseChatModel, BaseChatModelParams } from '@langchain/core/language_models/chat_models'
import { AIMessage, BaseMessage } from '@langchain/core/messages'
import { ChatResult } from '@langchain/core/outputs'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { getErrorMessage, mergeCredentials, SpeechToTextModel, TChatModelOptions } from '@xpert-ai/plugin-sdk'
import axios from 'axios'
import { TongyiProviderStrategy } from '../provider.strategy.js'
import { getDashscopeApiBase, TongyiCredentials } from '../types.js'

@Injectable()
export class TongyiSpeech2TextModel extends SpeechToTextModel {
  constructor(override readonly modelProvider: TongyiProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.SPEECH2TEXT)
  }

  override async validateCredentials(model: string, credentials: Record<string, any>): Promise<void> {
    return
  }

  override getChatModel(copilotModel: ICopilotModel, options?: TChatModelOptions): BaseChatModel {
    const credentials = mergeCredentials(
      copilotModel.copilot.modelProvider.credentials,
      options?.modelProperties
    ) as TongyiCredentials

    return new Speech2TextChatModel({
      apiKey: credentials.dashscope_api_key,
      model: copilotModel.model,
      baseUrl: getDashscopeApiBase(credentials),
    })
  }
}

export interface ChatTongyiSpeech2TextInput extends BaseChatModelParams {
  apiKey?: string
  model: string
  baseUrl: string
}

export class Speech2TextChatModel extends BaseChatModel {
  _llmType(): string {
    return 'tongyi-speech2text'
  }

  protected apiKey: string

  constructor(private fields?: Partial<ChatTongyiSpeech2TextInput>) {
    if (!fields?.apiKey) {
      throw new Error('Tongyi API key not found.')
    }
    super({ ...fields })
    this.apiKey = fields.apiKey
  }

  async _generate(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun
  ): Promise<ChatResult> {
    const humanMessage = messages[messages.length - 1]
    const fileUrls = (humanMessage.content as { url: string }[]).map((_) => _.url)
    const languageHints = ['zh', 'en']
    const taskId = await submitTask(
      this.fields?.baseUrl || 'https://dashscope.aliyuncs.com/api/v1',
      this.apiKey,
      fileUrls,
      languageHints,
      this.fields?.model || 'paraformer-v2'
    )

    if (taskId) {
      const result = await waitForComplete(this.fields?.baseUrl || 'https://dashscope.aliyuncs.com/api/v1', taskId, this.apiKey)
      const content = await processTranscriptions(result)
      return {
        generations: content.map((content) => ({
          text: content,
          message: new AIMessage({ content }),
        })),
      }
    }

    return { generations: [] }
  }
}

async function submitTask(
  baseUrl: string,
  apiKey: string,
  fileUrls: string[],
  languageHints: string[],
  model: string
): Promise<string | null> {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'X-DashScope-Async': 'enable',
  }

  const data = {
    model,
    input: {
      file_urls: fileUrls,
    },
    parameters: {
      channel_id: [0],
      language_hints: languageHints,
    },
  }

  const response = await axios.post(`${baseUrl}/services/audio/asr/transcription`, data, { headers })
  if (response.status === 200) {
    return response.data.output.task_id
  }
  throw new Error(`Failed to submit task: ${response.data.message || 'Unknown error'}`)
}

async function waitForComplete(baseUrl: string, taskId: string, apiKey: string): Promise<any> {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'X-DashScope-Async': 'enable',
  }

  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const response = await axios.post(`${baseUrl}/tasks/${taskId}`, {}, { headers })
        const status = response.data.output.task_status

        if (status === 'SUCCEEDED') {
          resolve(response.data.output.results)
        } else if (status === 'RUNNING' || status === 'PENDING') {
          setTimeout(poll, 300)
        } else {
          reject(response.data.output?.message || 'Task failed with unknown error')
        }
      } catch (error) {
        reject(error)
      }
    }

    poll()
  })
}

interface Sentence {
  text: string
}

interface Transcript {
  sentences: Sentence[]
}

interface TranscriptionResult {
  transcripts: Transcript[]
}

async function downloadAndExtractText(url: string): Promise<string> {
  try {
    const response = await axios.get<TranscriptionResult>(url, {
      responseType: 'json',
    })

    const allSentences: string[] = []
    for (const transcript of response.data.transcripts) {
      for (const sentence of transcript.sentences) {
        allSentences.push(sentence.text)
      }
    }

    return allSentences.join(' ')
  } catch (error) {
    throw new Error(`Failed to download transcription file: ${getErrorMessage(error)}`)
  }
}

async function processTranscriptions(results: { transcription_url: string }[]) {
  const texts: string[] = []
  for await (const result of results) {
    const text = await downloadAndExtractText(result.transcription_url)
    texts.push(text)
  }
  return texts
}
