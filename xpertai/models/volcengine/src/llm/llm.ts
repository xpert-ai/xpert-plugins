import { ChatOpenAI } from '@langchain/openai'
import { AiModelTypeEnum, ICopilotModel } from '@xpert-ai/contracts'
import { Injectable, Logger } from '@nestjs/common'
import {
  ChatOAICompatReasoningModel,
  CredentialsValidateFailedError,
  getErrorMessage,
  LargeLanguageModel,
  TChatModelOptions
} from '@xpert-ai/plugin-sdk'
import { isNil, omitBy } from 'lodash-es'
import { VolcengineProviderStrategy } from '../provider.strategy.js'
import { toCredentialKwargs, VolcengineModelCredentials } from '../types.js'

type JsonObject = Record<string, unknown>

interface ResolvedLocalReference {
  crossesArray: boolean
  value: unknown
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function decodeJsonPointerSegment(segment: string) {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~')
}

function resolveLocalReference(root: unknown, reference: string): ResolvedLocalReference | null {
  if (!reference.startsWith('#/')) return null

  let current = root
  let crossesArray = false
  const segments = reference.slice(2).split('/').map(decodeJsonPointerSegment)

  for (const segment of segments) {
    if (Array.isArray(current)) {
      if (!/^(0|[1-9]\d*)$/.test(segment)) return null
      crossesArray = true
      current = current[Number(segment)]
      if (current === undefined) return null
      continue
    }

    if (!isJsonObject(current) || !Object.prototype.hasOwnProperty.call(current, segment)) return null
    current = current[segment]
  }

  return { crossesArray, value: current }
}

/**
 * Ark's guided-decoding converter currently rejects local JSON Schema references that traverse
 * array members, for example `#/properties/createShapes/items/anyOf/0/properties/id`.
 * Inline only those references and leave ordinary named/recursive references untouched.
 */
export function normalizeVolcengineToolSchema(schema: unknown): unknown {
  const visit = (value: unknown, resolving: ReadonlySet<string>): unknown => {
    if (Array.isArray(value)) return value.map((item) => visit(item, resolving))
    if (!isJsonObject(value)) return value

    const reference = typeof value.$ref === 'string' ? value.$ref : null
    if (reference && !resolving.has(reference)) {
      const resolved = resolveLocalReference(schema, reference)
      if (resolved?.crossesArray) {
        const nextResolving = new Set(resolving)
        nextResolving.add(reference)
        const replacement = visit(resolved.value, nextResolving)
        const siblings = Object.fromEntries(
          Object.entries(value)
            .filter(([key]) => key !== '$ref')
            .map(([key, item]) => [key, visit(item, resolving)])
        )
        return isJsonObject(replacement) ? { ...replacement, ...siblings } : siblings
      }
    }

    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, visit(item, resolving)]))
  }

  return visit(schema, new Set())
}

class VolcengineChatOAICompatReasoningModel extends ChatOAICompatReasoningModel {
  protected override _convertChatOpenAIToolToCompletionsTool(
    tool: Parameters<ChatOAICompatReasoningModel['_convertChatOpenAIToolToCompletionsTool']>[0],
    fields?: Parameters<ChatOAICompatReasoningModel['_convertChatOpenAIToolToCompletionsTool']>[1]
  ): ReturnType<ChatOAICompatReasoningModel['_convertChatOpenAIToolToCompletionsTool']> {
    const converted = super._convertChatOpenAIToolToCompletionsTool(tool, fields)
    if (converted.type !== 'function') return converted
    const parameters = converted.function.parameters
    if (!parameters) return converted

    return {
      ...converted,
      function: {
        ...converted.function,
        parameters: normalizeVolcengineToolSchema(parameters) as typeof parameters
      }
    }
  }
}

function buildVolcengineModelKwargs(thinking: unknown) {
  if (thinking !== 'enabled' && thinking !== 'disabled') {
    return {}
  }

  return {
    thinking: {
      type: thinking
    },
    ...(thinking === 'disabled' ? { reasoning_effort: 'minimal' } : {})
  }
}

@Injectable()
export class VolcengineLargeLanguageModel extends LargeLanguageModel {
  readonly #logger = new Logger(VolcengineLargeLanguageModel.name)

  constructor(modelProvider: VolcengineProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.LLM)
  }

  async validateCredentials(model: string, credentials: VolcengineModelCredentials): Promise<void> {
    try {
      const chatModel = new ChatOpenAI({
        ...toCredentialKwargs(credentials),
        model,
        temperature: 0,
        maxTokens: 5
      })
      await chatModel.invoke([
        {
          role: 'human',
          content: `Hi`
        }
      ])
    } catch (err) {
      throw new CredentialsValidateFailedError(getErrorMessage(err))
    }
  }

  override getChatModel(copilotModel: ICopilotModel, options?: TChatModelOptions) {
    const { handleLLMTokens } = options ?? {}
    const { copilot } = copilotModel
    const { modelProvider } = copilot
    const credentials = modelProvider?.credentials as VolcengineModelCredentials
    const params = toCredentialKwargs(credentials)

    const model = copilotModel.model
    const fields = omitBy(
      {
        ...params,
        model,
        maxTokens: copilotModel.options?.['max_tokens'],
        modelKwargs: buildVolcengineModelKwargs(copilotModel.options?.['thinking']),
        // include token usage in the stream. this will include an additional chunk at the end of the stream with the token usage.
        streamUsage: true
      },
      isNil
    )
    return new VolcengineChatOAICompatReasoningModel({
      ...fields,
      verbose: options?.verbose,
      callbacks: [
        ...this.createHandleUsageCallbacks(copilot, model, credentials, handleLLMTokens),
        this.createHandleLLMErrorCallbacks(fields, this.#logger)
      ]
    })
  }
}
