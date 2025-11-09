import 'dotenv/config';

import { ICopilotModel } from '@metad/contracts'
import { XinferenceLargeLanguageModel } from './llm.js'
import { XinferenceProviderStrategy } from '../provider.strategy.js'


describe('XinferenceLargeLanguageModel (live xinference)', () => {
  let liveLLM: XinferenceLargeLanguageModel
  let provider: XinferenceProviderStrategy

  const serverUrl = process.env.XINFERENCE_SERVER_URL as string
  const apiKey = process.env.XINFERENCE_API_KEY as string
  const modelUid = process.env.XINFERENCE_CHAT_MODEL
  const testPrompt = process.env.XINFERENCE_TEST_PROMPT ?? '请用一句话介绍你自己。'

  beforeAll(async () => {
    jest.resetModules()

    provider = new XinferenceProviderStrategy()
    ;(provider as any).credentials = {
      api_key: apiKey,
      server_url: serverUrl,
      model_uid: modelUid
    }

    liveLLM = new XinferenceLargeLanguageModel(provider)
  })

  it('validates credentials against a live Xinference deployment', async () => {
    const credentials = {
      api_key: apiKey,
      server_url: serverUrl,
      model_uid: modelUid
    }

    await expect(liveLLM.validateCredentials('', credentials)).resolves.toBeUndefined()
  }, 10000)

  it('performs a real chat completion', async () => {
    const copilotModel = {
      model: modelUid,
      copilot: {
        modelProvider: provider
      }
    } as unknown as ICopilotModel

    const chatModel = liveLLM.getChatModel(copilotModel, {
      modelProperties: {
        api_key: apiKey,
        server_url: serverUrl,
        model_uid: modelUid
      },
      handleLLMTokens: jest.fn(),
      verbose: false
    })

    const response = await chatModel.invoke([
      {
        role: 'human',
        content: testPrompt
      }
    ])

    const normalizeContent = (output: any): string => {
      if (!output) {
        return ''
      }
      if (typeof output === 'string') {
        return output
      }
      if (Array.isArray(output)) {
        return output
          .map((part: any) => {
            if (!part) {
              return ''
            }
            if (typeof part === 'string') {
              return part
            }
            if (typeof part.text === 'string') {
              return part.text
            }
            if (typeof part.content === 'string') {
              return part.content
            }
            return ''
          })
          .join('')
      }
      if (typeof output.content === 'string') {
        return output.content
      }
      return ''
    }

    const content = normalizeContent((response as any)?.content ?? response)
    console.log('Xinference LLM response:', content)
    expect(content.trim().length).toBeGreaterThan(0)
  })
})
