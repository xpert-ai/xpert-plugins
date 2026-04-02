import { SystemMessage, ToolMessage } from '@langchain/core/messages'
import { Command } from '@langchain/langgraph'
import { tool, type DynamicStructuredTool } from '@langchain/core/tools'
import { Injectable } from '@nestjs/common'
import { ZodError } from 'zod'
import {
  ASK_CLARIFICATION_TOOL_NAME,
  AskClarificationInputSchema,
  CLARIFICATION_METADATA_KEY,
  type ClarificationMetadata,
  type ClarificationPluginConfig,
  ClarificationPluginConfigSchema,
  type ResolvedClarificationInput
} from './clarification.types.js'

const TOOL_INTERCEPT_PLACEHOLDER =
  'Clarification middleware intercepted this tool call before ordinary execution.'
const INVALID_CLARIFICATION_REASON =
  'Invalid `ask_clarification` input. Provide a non-empty `question` field before asking the user to clarify.'
const INVALID_CLARIFICATION_GENERIC_REASON =
  'Invalid `ask_clarification` input. Check the tool arguments and try again.'

type ClarificationToolMetadata = {
  invalid: boolean
  reason?: string
  clarification?: ClarificationMetadata
}

type MessageLanguage = 'zh' | 'en'

@Injectable()
export class ClarificationService {
  resolveConfig(config?: Partial<ClarificationPluginConfig>): ClarificationPluginConfig {
    return ClarificationPluginConfigSchema.parse(config ?? {})
  }

  buildSystemPrompt(config: ClarificationPluginConfig): string {
    const modeLine =
      config.promptMode === 'soft'
        ? 'When the user request is underspecified, ambiguous, risky, or requires a choice, prefer calling `ask_clarification` before taking further action.'
        : 'When the user request is underspecified, ambiguous, risky, or requires a choice, call `ask_clarification` before taking further action.'

    return [
      '<ask_clarification>',
      modeLine,
      'Do not continue with other tool calls after deciding clarification is required.',
      'If clarification is needed, emit exactly one `ask_clarification` tool call and no other tool calls in the same response.',
      'Calling `ask_clarification` ends the current run immediately and waits for the user response in the next turn.',
      'Ask one focused clarification at a time unless multiple tightly-related options must be presented together.',
      '</ask_clarification>'
    ].join('\n')
  }

  buildSystemMessage(
    existingContent: SystemMessage['content'] | undefined,
    config: ClarificationPluginConfig
  ): SystemMessage {
    const prompt = this.buildSystemPrompt(config)

    if (typeof existingContent === 'string') {
      return new SystemMessage({
        content: [existingContent, prompt].filter(Boolean).join('\n\n')
      })
    }

    if (Array.isArray(existingContent)) {
      return new SystemMessage({
        content: [...existingContent, { type: 'text', text: prompt }]
      })
    }

    return new SystemMessage({
      content: prompt
    })
  }

  createTool(): DynamicStructuredTool {
    return tool(
      async () => TOOL_INTERCEPT_PLACEHOLDER,
      {
        name: ASK_CLARIFICATION_TOOL_NAME,
        description:
          'Ask the user for missing information, a decision, or confirmation before continuing. Use this when the request is ambiguous, risky, or underspecified. This must be the only tool call in the response and ends the current run immediately.',
        schema: AskClarificationInputSchema
      }
    )
  }

  resolveInput(rawArgs: unknown): ResolvedClarificationInput {
    const parsed = AskClarificationInputSchema.parse(this.normalizeRawArgs(rawArgs))
    return {
      ...parsed,
      context: normalizeOptionalText(parsed.context),
      options: parsed.options.map((option) => option.trim()).filter(Boolean),
      required: true
    }
  }

  formatMessage(input: ResolvedClarificationInput): string {
    const language = detectMessageLanguage(input)
    const lines =
      language === 'zh'
        ? [input.required ? '需要先确认以下信息：' : '最好先确认以下信息：']
        : [
            input.required
              ? 'I need to confirm the following before continuing:'
              : 'It would help to confirm the following first:'
          ]

    if (input.context) {
      lines.push('', input.context)
    }

    lines.push('', input.question)

    if (input.options.length > 0) {
      lines.push('', language === 'zh' ? '可选项：' : 'Options:')
      input.options.forEach((option, index) => {
        lines.push(`${index + 1}. ${option}`)
      })
    }

    if (input.allowFreeText) {
      lines.push(
        '',
        language === 'zh' ? '也可以直接回复你的具体想法。' : 'You can also reply in your own words.'
      )
    }

    return lines.join('\n')
  }

  buildToolMessage(input: ResolvedClarificationInput, toolCallId?: string | null): ToolMessage {
    return new ToolMessage({
      name: ASK_CLARIFICATION_TOOL_NAME,
      tool_call_id: this.normalizeToolCallId(toolCallId),
      content: this.formatMessage(input),
      status: 'success',
      metadata: {
        [CLARIFICATION_METADATA_KEY]: {
          version: 'v1',
          kind: 'clarification',
          question: input.question,
          clarificationType: input.clarificationType,
          context: input.context,
          options: input.options,
          allowFreeText: input.allowFreeText,
          required: input.required
        } satisfies ClarificationMetadata
      }
    })
  }

  buildInvalidToolMessage(toolCallId?: string | null, reason = INVALID_CLARIFICATION_REASON): ToolMessage {
    const metadata: ClarificationToolMetadata = {
      invalid: true,
      reason
    }

    return new ToolMessage({
      name: ASK_CLARIFICATION_TOOL_NAME,
      tool_call_id: this.normalizeToolCallId(toolCallId),
      content: reason,
      status: 'error',
      metadata: {
        [CLARIFICATION_METADATA_KEY]: metadata
      }
    })
  }

  buildEndCommand(toolMessage: ToolMessage) {
    return new Command({
      update: {
        messages: [toolMessage]
      },
      goto: 'end'
    })
  }

  buildToolResponse(input: ResolvedClarificationInput, toolCallId?: string | null) {
    const toolMessage = this.buildToolMessage(input, toolCallId)
    return this.buildEndCommand(toolMessage)
  }

  resolveInvalidReason(error: unknown): string {
    if (error instanceof ZodError) {
      const hasQuestionIssue = error.issues.some((issue) => issue.path[0] === 'question')
      return hasQuestionIssue ? INVALID_CLARIFICATION_REASON : INVALID_CLARIFICATION_GENERIC_REASON
    }

    return INVALID_CLARIFICATION_GENERIC_REASON
  }

  private normalizeRawArgs(rawArgs: unknown): Record<string, unknown> {
    if (!rawArgs || typeof rawArgs !== 'object' || Array.isArray(rawArgs)) {
      return {}
    }

    const raw = rawArgs as Record<string, unknown>
    const question = normalizeOptionalText(raw['question'])
    const clarificationType = normalizeOptionalText(raw['clarificationType'])
    const context = normalizeOptionalText(raw['context'])
    const allowFreeText = normalizeOptionalBoolean(raw['allowFreeText'])
    const required = normalizeOptionalBoolean(raw['required'])
    const options = normalizeStringArray(raw['options'])

    return {
      ...(question ? { question } : {}),
      ...(clarificationType ? { clarificationType } : {}),
      ...(context ? { context } : {}),
      ...(options ? { options } : {}),
      ...(allowFreeText === undefined ? {} : { allowFreeText }),
      ...(required === undefined ? {} : { required })
    }
  }

  private normalizeToolCallId(toolCallId?: string | null): string {
    if (typeof toolCallId !== 'string') {
      return ''
    }

    return toolCallId.trim()
  }

}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed || undefined
}

function normalizeOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const items = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)

  return items
}

function detectMessageLanguage(input: Pick<ResolvedClarificationInput, 'question' | 'context' | 'options'>): MessageLanguage {
  const text = [input.question, input.context, ...input.options].filter(Boolean).join(' ')
  return /[\u3400-\u9fff]/.test(text) ? 'zh' : 'en'
}
