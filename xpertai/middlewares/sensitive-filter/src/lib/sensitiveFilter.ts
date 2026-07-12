import { AIMessage } from '@langchain/core/messages'
import { BaseLanguageModel } from '@langchain/core/language_models/base'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { JSONValue, TAgentMiddlewareMeta, TAgentRunnableConfigurable } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
} from '@xpert-ai/plugin-sdk'
import {
  CompiledSensitiveRule,
  RuleModeConfig,
  SensitiveFilterConfig,
  SensitiveFilterIcon,
  LlmModeConfig,
  llmDecisionSchema,
  sensitiveFilterConfigSchema,
} from './types.js'
import {
  BUSINESS_RULES_VALIDATION_ERROR,
  CONFIG_PARSE_ERROR,
  DEFAULT_INPUT_BLOCK_MESSAGE,
  DEFAULT_OUTPUT_BLOCK_MESSAGE,
  SENSITIVE_FILTER_MIDDLEWARE_NAME,
} from './constants.js'
import { sensitiveFilterMiddlewareConfigSchema } from './config-schema.js'
import {
  buildInternalModelConfig,
  invokeLlmDecision,
  modeIncludesScope,
  resolveOnErrorDecision,
  resolveRuntimeLlmConfig,
} from './llm-filter.js'
import {
  BufferedOutputProxyChatModel,
  cloneAiMessage,
  cloneAiMessageWithText,
  extractModelResponseText,
  replaceModelResponseText,
  rewriteModelRequestInput,
} from './message-utils.js'
import {
  compileSensitiveRules,
  findMatches,
  normalizeRuleDrafts,
  pickWinningRule,
  rewriteTextByRule,
} from './rule-filter.js'
import type {
  AuditEntry,
  AuditSnapshot,
  BufferedOutputResolution,
  LlmOutputMethod,
  LlmOutputMethodAttempt,
  LlmOutputTrace,
  MatchPhase,
  ResolvedLlmConfig,
  ResolvedLlmDecision,
} from './runtime-types.js'
import { extractInputText } from './text-utils.js'
import {
  formatPhaseExecutionTitle,
  getErrorText,
  normalizeConfigurable,
  resolveAgentChannelName,
  runWithWrapWorkflowFallback,
  toNonEmptyString,
  toSnippet,
} from './utils.js'
import {
  buildMatchedNotificationMessage,
  dispatchWecomNotification,
  resolveRuntimeWecomConfig,
} from './wecom-notify.js'


@Injectable()
@AgentMiddlewareStrategy(SENSITIVE_FILTER_MIDDLEWARE_NAME)
export class SensitiveFilterMiddleware implements IAgentMiddlewareStrategy<SensitiveFilterConfig> {
  readonly meta: TAgentMiddlewareMeta = {
    name: SENSITIVE_FILTER_MIDDLEWARE_NAME,
    label: {
      en_US: 'Sensitive Filter Middleware',
      zh_Hans: '敏感内容过滤中间件',
    },
    description: {
      en_US:
        'Filter sensitive content before input and after output using rule mode or LLM prompt mode (mutually exclusive).',
      zh_Hans: '支持规则模式或 LLM 提示词模式（互斥）进行输入/输出敏感内容过滤。',
    },
    icon: {
      type: 'svg',
      value: SensitiveFilterIcon,
    },
    configSchema: sensitiveFilterMiddlewareConfigSchema,
  }

  async createMiddleware(
    options: SensitiveFilterConfig,
    context: IAgentMiddlewareContext,
  ): Promise<AgentMiddleware> {
    const parsed = sensitiveFilterConfigSchema.safeParse(options ?? {})
    if (!parsed.success) {
      throw new Error(CONFIG_PARSE_ERROR)
    }

    if (parsed.data.mode === 'llm') {
      return this.createLlmModeMiddleware(parsed.data as LlmModeConfig, context)
    }

    return this.createRuleModeMiddleware(parsed.data as RuleModeConfig, context)
  }

  private createRuleModeMiddleware(config: RuleModeConfig, context: IAgentMiddlewareContext): AgentMiddleware {
    const middlewareRuntime = context.runtime
    const caseSensitive = config.caseSensitive ?? false
    const normalize = config.normalize ?? true
    const wecomConfig = resolveRuntimeWecomConfig(config.wecom)

    const customRules = normalizeRuleDrafts(config.rules ?? [])
    const allRules = [...customRules]
    const hasEffectiveRules = allRules.length > 0

    let compiledRulesCache: CompiledSensitiveRule[] | null = null
    const getCompiledRules = (): CompiledSensitiveRule[] => {
      if (compiledRulesCache) {
        return compiledRulesCache
      }

      compiledRulesCache = compileSensitiveRules(allRules, normalize, caseSensitive)

      return compiledRulesCache
    }

    let inputBlockedMessage: string | null = null
    let pendingInputRewrite: string | null = null
    let bufferedOutputResolution: BufferedOutputResolution | null = null
    let finalAction: 'pass' | 'block' | 'rewrite' = 'pass'
    let auditEntries: AuditEntry[] = []
    let runtimeConfigurable: TAgentRunnableConfigurable | null = null
    let latestInputSnippet = ''

    const resetRunState = () => {
      inputBlockedMessage = null
      pendingInputRewrite = null
      bufferedOutputResolution = null
      finalAction = 'pass'
      auditEntries = []
      latestInputSnippet = ''
    }

    const pushAudit = (entry: Omit<AuditEntry, 'timestamp' | 'mode'>) => {
      auditEntries.push({
        ...entry,
        timestamp: new Date().toISOString(),
        mode: 'rule',
      })
    }

    const assignRuntimeConfigurable = (runtimeLike: unknown) => {
      const configurable = normalizeConfigurable((runtimeLike as any)?.configurable)
      if (!configurable) {
        return
      }
      if (configurable.thread_id && configurable.executionId) {
        runtimeConfigurable = configurable
      }
    }

    const buildAuditSnapshot = (): AuditSnapshot => {
      const summary = {
        total: auditEntries.length,
        matched: auditEntries.filter((entry) => entry.matched).length,
        blocked: auditEntries.filter((entry) => entry.action === 'block').length,
        rewritten: auditEntries.filter((entry) => entry.action === 'rewrite').length,
        errorPolicyTriggered: auditEntries.filter((entry) => entry.errorPolicyTriggered).length,
      }

      return {
        mode: 'rule',
        finalAction,
        records: auditEntries,
        summary,
      }
    }

    const persistAuditSnapshot = async () => {
      const configurable = runtimeConfigurable
      if (!configurable?.thread_id || !configurable.executionId) {
        return
      }

      const { thread_id, checkpoint_id, executionId } = configurable
      const snapshot = buildAuditSnapshot()
      const writeSnapshot = async () => {
        return {
          state: snapshot as unknown as Record<string, unknown>,
          output: snapshot as unknown as JSONValue,
        }
      }

      await runWithWrapWorkflowFallback(
        async () => {
          await middlewareRuntime.wrapWorkflowNodeExecution(writeSnapshot, {
            execution: {
              category: 'workflow',
              type: 'middleware',
              title: `${context.node.title} Audit`,
              inputs: {
                mode: snapshot.mode,
                total: snapshot.summary.total,
              },
              parentId: executionId,
              threadId: thread_id,
              checkpointNs: '',
              checkpointId: checkpoint_id,
              channelName: resolveAgentChannelName(configurable),
              agentKey: context.node.key,
            },
          })
          return undefined
        },
        async () => {
          await writeSnapshot()
          return undefined
        },
      )
    }

    return {
      name: SENSITIVE_FILTER_MIDDLEWARE_NAME,
      beforeAgent: async (state, runtime) => {
        resetRunState()
        assignRuntimeConfigurable(runtime)

        if (!hasEffectiveRules) {
          throw new Error(BUSINESS_RULES_VALIDATION_ERROR)
        }
        const compiledRules = getCompiledRules()

        const safeState = state ?? {}
        const safeRuntime = runtime ?? {}

        const inputText = extractInputText(safeState, safeRuntime)
        latestInputSnippet = toSnippet(inputText)
        const inputMatches = findMatches(inputText, 'input', compiledRules, normalize, caseSensitive)
        const winner = pickWinningRule(inputMatches)

        if (!winner) {
          pushAudit({
            phase: 'input',
            matched: false,
            source: 'rule',
            errorPolicyTriggered: false,
          })
          return undefined
        }

        pushAudit({
          phase: 'input',
          matched: true,
          source: 'rule',
          action: winner.action,
          reason: `rule:${winner.id}`,
          errorPolicyTriggered: false,
        })

        if (winner.action === 'block') {
          finalAction = 'block'
          inputBlockedMessage = winner.replacementText?.trim() || DEFAULT_INPUT_BLOCK_MESSAGE
          return undefined
        }

        finalAction = 'rewrite'
        pendingInputRewrite = rewriteTextByRule(inputText, winner, caseSensitive)
        return undefined
      },
      wrapModelCall: async (request, handler) => {
        assignRuntimeConfigurable(request?.runtime)
        if (!hasEffectiveRules) {
          throw new Error(BUSINESS_RULES_VALIDATION_ERROR)
        }
        const compiledRules = getCompiledRules()

        if (inputBlockedMessage) {
          return new AIMessage(inputBlockedMessage)
        }

        const modelRequest = pendingInputRewrite ? rewriteModelRequestInput(request, pendingInputRewrite) : request
        pendingInputRewrite = null
        bufferedOutputResolution = null
        const shouldBufferOutput = compiledRules.some((rule) => rule.scope === 'output' || rule.scope === 'both')
        const effectiveRequest = shouldBufferOutput
          ? {
              ...modelRequest,
              model: new BufferedOutputProxyChatModel(modelRequest.model as BaseLanguageModel, async (message, outputText) => {
                if (message.tool_calls?.length || message.invalid_tool_calls?.length) {
                  bufferedOutputResolution = {
                    finalMessage: cloneAiMessage(message),
                    matched: false,
                    source: 'rule',
                    reason: 'tool-call-skip',
                    errorPolicyTriggered: false,
                  }
                  return bufferedOutputResolution
                }

                const outputMatches = findMatches(outputText, 'output', compiledRules, normalize, caseSensitive)
                const winner = pickWinningRule(outputMatches)

                if (!winner) {
                  bufferedOutputResolution = {
                    finalMessage: cloneAiMessage(message),
                    matched: false,
                    source: 'rule',
                    errorPolicyTriggered: false,
                  }
                  return bufferedOutputResolution
                }

                const finalText =
                  winner.action === 'block'
                    ? winner.replacementText?.trim() || DEFAULT_OUTPUT_BLOCK_MESSAGE
                    : rewriteTextByRule(outputText, winner, caseSensitive)

                bufferedOutputResolution = {
                  finalMessage: cloneAiMessageWithText(message, finalText),
                  matched: true,
                  source: 'rule',
                  action: winner.action,
                  reason: `rule:${winner.id}`,
                  errorPolicyTriggered: false,
                }
                return bufferedOutputResolution
              }),
            }
          : modelRequest

        const response = await handler(effectiveRequest)

        if (bufferedOutputResolution) {
          pushAudit({
            phase: 'output',
            matched: bufferedOutputResolution.matched,
            source: bufferedOutputResolution.source,
            action: bufferedOutputResolution.action,
            reason: bufferedOutputResolution.reason,
            errorPolicyTriggered: bufferedOutputResolution.errorPolicyTriggered,
          })

          if (bufferedOutputResolution.matched && bufferedOutputResolution.action) {
            finalAction = bufferedOutputResolution.action === 'block' ? 'block' : 'rewrite'
          }

          return response
        }

        const outputText = extractModelResponseText(response)
        const outputMatches = findMatches(outputText, 'output', compiledRules, normalize, caseSensitive)
        const winner = pickWinningRule(outputMatches)

        if (!winner) {
          pushAudit({
            phase: 'output',
            matched: false,
            source: 'rule',
            errorPolicyTriggered: false,
          })
          return response
        }

        pushAudit({
          phase: 'output',
          matched: true,
          source: 'rule',
          action: winner.action,
          reason: `rule:${winner.id}`,
          errorPolicyTriggered: false,
        })

        if (winner.action === 'block') {
          finalAction = 'block'
          const blockedOutput = winner.replacementText?.trim() || DEFAULT_OUTPUT_BLOCK_MESSAGE
          return replaceModelResponseText(response, blockedOutput)
        }

        finalAction = 'rewrite'
        const rewrittenOutput = rewriteTextByRule(outputText, winner, caseSensitive)
        return replaceModelResponseText(response, rewrittenOutput)
      },
      afterAgent: async () => {
        const matchedRecords = auditEntries.filter((entry) => entry.matched)
        const notification =
          matchedRecords.length > 0
            ? buildMatchedNotificationMessage({
                mode: 'rule',
                nodeTitle: context.node.title ?? SENSITIVE_FILTER_MIDDLEWARE_NAME,
                finalAction,
                records: matchedRecords,
                runtimeConfigurable,
                inputSnippet: latestInputSnippet,
              })
            : null

        const [persistResult, notifyResult] = await Promise.allSettled([
          persistAuditSnapshot(),
          notification ? dispatchWecomNotification(wecomConfig, notification) : Promise.resolve(undefined),
        ])

        if (persistResult.status === 'rejected') {
          console.warn(
            `[${SENSITIVE_FILTER_MIDDLEWARE_NAME}] Failed to persist audit snapshot: ${getErrorText(persistResult.reason)}`,
          )
        }
        if (notifyResult.status === 'rejected') {
          console.warn(
            `[${SENSITIVE_FILTER_MIDDLEWARE_NAME}] Failed to dispatch WeCom notification: ${getErrorText(notifyResult.reason)}`,
          )
        }
        return undefined
      },
    }
  }

  private createLlmModeMiddleware(config: LlmModeConfig, context: IAgentMiddlewareContext): AgentMiddleware {
    const middlewareRuntime = context.runtime
    const llmDraftConfig = config.llm
    const wecomConfig = resolveRuntimeWecomConfig(config.wecom)
    let resolvedLlmConfig: ResolvedLlmConfig | null = null
    let modelPromise: Promise<BaseLanguageModel> | null = null
    const structuredModelPromises = new Map<LlmOutputMethod, Promise<any>>()

    const getLlmConfig = (): ResolvedLlmConfig => {
      if (!resolvedLlmConfig) {
        resolvedLlmConfig = resolveRuntimeLlmConfig(llmDraftConfig)
      }
      return resolvedLlmConfig
    }

    const ensureModel = async (): Promise<BaseLanguageModel> => {
      const llmConfig = getLlmConfig()
      if (!modelPromise) {
        modelPromise = middlewareRuntime.createModelClient<BaseLanguageModel>(buildInternalModelConfig(llmConfig.model), {
          usageCallback: () => {
            //
          },
        })
      }
      return modelPromise
    }

    const ensureStructuredModel = async (
      method: LlmOutputMethod,
    ): Promise<BaseChatModel> => {
      if (!structuredModelPromises.has(method)) {
        structuredModelPromises.set(
          method,
          (async () => {
            const model = await ensureModel()
            return model.withStructuredOutput?.(llmDecisionSchema, {
              method,
            }) ?? null
          })(),
        )
      }
      return structuredModelPromises.get(method)! as Promise<BaseChatModel>
    }

    let pendingInputRewrite: string | null = null
    let bufferedOutputResolution: BufferedOutputResolution | null = null
    let finalAction: 'pass' | 'rewrite' = 'pass'
    let auditEntries: AuditEntry[] = []
    let runtimeConfigurable: TAgentRunnableConfigurable | null = null
    let latestInputSnippet = ''
    let resolvedOutputMethod: LlmOutputMethodAttempt | undefined
    let fallbackTriggered = false
    let methodAttempts: LlmOutputMethodAttempt[] = []

    const resetRunState = () => {
      pendingInputRewrite = null
      bufferedOutputResolution = null
      finalAction = 'pass'
      auditEntries = []
      latestInputSnippet = ''
      resolvedOutputMethod = undefined
      fallbackTriggered = false
      methodAttempts = []
    }

    const pushAudit = (entry: Omit<AuditEntry, 'timestamp' | 'mode'>) => {
      auditEntries.push({
        ...entry,
        timestamp: new Date().toISOString(),
        mode: 'llm',
      })
    }

    const assignRuntimeConfigurable = (runtimeLike: unknown) => {
      const configurable = normalizeConfigurable((runtimeLike as any)?.configurable)
      if (!configurable) {
        return
      }
      if (configurable.thread_id && configurable.executionId) {
        runtimeConfigurable = configurable
      }
    }

    const captureLlmOutputTrace = (trace: LlmOutputTrace) => {
      for (const method of trace.methodAttempts) {
        if (!methodAttempts.includes(method)) {
          methodAttempts.push(method)
        }
      }
      resolvedOutputMethod = trace.resolvedOutputMethod
      fallbackTriggered = fallbackTriggered || trace.fallbackTriggered
    }

    const buildAuditSnapshot = (): AuditSnapshot => {
      const summary = {
        total: auditEntries.length,
        matched: auditEntries.filter((entry) => entry.matched).length,
        blocked: auditEntries.filter((entry) => entry.action === 'block').length,
        rewritten: auditEntries.filter((entry) => entry.action === 'rewrite').length,
        errorPolicyTriggered: auditEntries.filter((entry) => entry.errorPolicyTriggered).length,
      }

      return {
        mode: 'llm',
        finalAction,
        records: auditEntries,
        summary,
        llmOutput: resolvedLlmConfig
          ? {
              requestedOutputMethod: resolvedLlmConfig.outputMethod,
              resolvedOutputMethod,
              methodAttempts,
              fallbackTriggered,
            }
          : undefined,
      }
    }

    const persistAuditSnapshot = async () => {
      const configurable = runtimeConfigurable
      if (!configurable?.thread_id || !configurable.executionId) {
        return
      }

      const { thread_id, checkpoint_id, executionId } = configurable
      const snapshot = buildAuditSnapshot()
      const writeSnapshot = async () => {
        return {
          state: snapshot as unknown as Record<string, unknown>,
          output: snapshot as unknown as JSONValue,
        }
      }

      await runWithWrapWorkflowFallback(
        async () => {
          await middlewareRuntime.wrapWorkflowNodeExecution(writeSnapshot, {
            execution: {
              category: 'workflow',
              type: 'middleware',
              title: `${context.node.title} Audit`,
              inputs: {
                mode: snapshot.mode,
                total: snapshot.summary.total,
              },
              parentId: executionId,
              threadId: thread_id,
              checkpointNs: '',
              checkpointId: checkpoint_id,
              channelName: resolveAgentChannelName(configurable),
              agentKey: context.node.key,
            },
          })
          return undefined
        },
        async () => {
          await writeSnapshot()
          return undefined
        },
      )
    }

    const invokeAndTrack = async (
      phase: MatchPhase,
      text: string,
      runtime: any,
      llmConfig: ResolvedLlmConfig,
    ): Promise<ResolvedLlmDecision> => {
      const evaluateCore = async (): Promise<ResolvedLlmDecision> => {
        const { decision, trace } = await invokeLlmDecision({
          phase,
          text,
          llmConfig,
          ensureModel,
          ensureStructuredModel,
        })
        captureLlmOutputTrace(trace)
        return decision
      }

      const configurable = (runtime?.configurable ?? {}) as TAgentRunnableConfigurable
      const { thread_id, checkpoint_id, executionId } = configurable

      if (!thread_id || !executionId) {
        return evaluateCore()
      }

      let trackedDecision: ResolvedLlmDecision | null = null

      await runWithWrapWorkflowFallback(
        async () => {
          await middlewareRuntime.wrapWorkflowNodeExecution(async () => {
            const decision = await evaluateCore()
            trackedDecision = decision
            return {
              state: decision as Record<string, unknown>,
              output: undefined,
            }
          }, {
            execution: {
              category: 'workflow',
              type: 'middleware',
              inputs: {
                phase,
                text,
              },
              parentId: executionId,
              threadId: thread_id,
              checkpointNs: '',
              checkpointId: checkpoint_id,
              channelName: resolveAgentChannelName(configurable),
              agentKey: context.node.key,
              title: formatPhaseExecutionTitle(context.node.title, phase),
            },
          })
          return undefined
        },
        async () => {
          trackedDecision = await evaluateCore()
          return undefined
        },
      )

      if (!trackedDecision) {
        throw new Error('LLM decision tracking failed: no decision resolved')
      }

      return trackedDecision
    }

    return {
      name: SENSITIVE_FILTER_MIDDLEWARE_NAME,
      beforeAgent: async (state, runtime) => {
        resetRunState()
        assignRuntimeConfigurable(runtime)
        const llmConfig = getLlmConfig()

        if (!modeIncludesScope(llmConfig.scope, 'input')) {
          pushAudit({
            phase: 'input',
            matched: false,
            source: 'llm',
            reason: 'scope-skip',
            errorPolicyTriggered: false,
          })
          return undefined
        }

        const inputText = extractInputText(state ?? {}, runtime ?? {})
        latestInputSnippet = toSnippet(inputText)
        if (!inputText) {
          pushAudit({
            phase: 'input',
            matched: false,
            source: 'llm',
            reason: 'empty-input',
            errorPolicyTriggered: false,
          })
          return undefined
        }

        let decision: ResolvedLlmDecision
        let fromErrorPolicy = false

        try {
          decision = await invokeAndTrack('input', inputText, runtime, llmConfig)
        } catch (error) {
          decision = resolveOnErrorDecision(llmConfig, error)
          fromErrorPolicy = true
        }

        pushAudit({
          phase: 'input',
          matched: decision.matched,
          source: fromErrorPolicy ? 'error-policy' : 'llm',
          action: decision.action,
          reason: decision.reason,
          errorPolicyTriggered: fromErrorPolicy,
        })

        if (!decision.matched || !decision.action) {
          return undefined
        }

        finalAction = 'rewrite'
        pendingInputRewrite = toNonEmptyString(decision.replacementText) ?? llmConfig.rewriteFallbackText
        return undefined
      },
      wrapModelCall: async (request, handler) => {
        assignRuntimeConfigurable(request?.runtime)
        const llmConfig = getLlmConfig()
        const modelRequest = pendingInputRewrite ? rewriteModelRequestInput(request, pendingInputRewrite) : request
        pendingInputRewrite = null
        bufferedOutputResolution = null
        const effectiveRequest = modeIncludesScope(llmConfig.scope, 'output')
          ? {
              ...modelRequest,
              model: new BufferedOutputProxyChatModel(modelRequest.model as BaseLanguageModel, async (message, outputText) => {
                if (message.tool_calls?.length || message.invalid_tool_calls?.length) {
                  bufferedOutputResolution = {
                    finalMessage: cloneAiMessage(message),
                    matched: false,
                    source: 'llm',
                    reason: 'tool-call-skip',
                    errorPolicyTriggered: false,
                  }
                  return bufferedOutputResolution
                }

                if (!outputText) {
                  bufferedOutputResolution = {
                    finalMessage: cloneAiMessage(message),
                    matched: false,
                    source: 'llm',
                    reason: 'empty-output',
                    errorPolicyTriggered: false,
                  }
                  return bufferedOutputResolution
                }

                let decision: ResolvedLlmDecision
                let fromErrorPolicy = false

                try {
                  decision = await invokeAndTrack('output', outputText, request?.runtime, llmConfig)
                } catch (error) {
                  decision = resolveOnErrorDecision(llmConfig, error)
                  fromErrorPolicy = true
                }

                const finalText =
                  decision.matched && decision.action
                    ? toNonEmptyString(decision.replacementText) ?? llmConfig.rewriteFallbackText
                    : outputText

                bufferedOutputResolution = {
                  finalMessage: cloneAiMessageWithText(message, finalText),
                  matched: decision.matched,
                  source: fromErrorPolicy ? 'error-policy' : 'llm',
                  action: decision.action,
                  reason: decision.reason,
                  errorPolicyTriggered: fromErrorPolicy,
                }
                return bufferedOutputResolution
              }),
            }
          : modelRequest

        const response = await handler(effectiveRequest)

        if (bufferedOutputResolution) {
          pushAudit({
            phase: 'output',
            matched: bufferedOutputResolution.matched,
            source: bufferedOutputResolution.source,
            action: bufferedOutputResolution.action,
            reason: bufferedOutputResolution.reason,
            errorPolicyTriggered: bufferedOutputResolution.errorPolicyTriggered,
          })

          if (bufferedOutputResolution.matched && bufferedOutputResolution.action) {
            finalAction = 'rewrite'
          }

          return response
        }

        if (!modeIncludesScope(llmConfig.scope, 'output')) {
          pushAudit({
            phase: 'output',
            matched: false,
            source: 'llm',
            reason: 'scope-skip',
            errorPolicyTriggered: false,
          })
          return response
        }

        const outputText = extractModelResponseText(response)
        if (!outputText) {
          pushAudit({
            phase: 'output',
            matched: false,
            source: 'llm',
            reason: 'empty-output',
            errorPolicyTriggered: false,
          })
          return response
        }

        let decision: ResolvedLlmDecision
        let fromErrorPolicy = false

        try {
          decision = await invokeAndTrack('output', outputText, request?.runtime, llmConfig)
        } catch (error) {
          decision = resolveOnErrorDecision(llmConfig, error)
          fromErrorPolicy = true
        }

        pushAudit({
          phase: 'output',
          matched: decision.matched,
          source: fromErrorPolicy ? 'error-policy' : 'llm',
          action: decision.action,
          reason: decision.reason,
          errorPolicyTriggered: fromErrorPolicy,
        })

        if (!decision.matched || !decision.action) {
          return response
        }

        finalAction = 'rewrite'
        return replaceModelResponseText(
          response,
          toNonEmptyString(decision.replacementText) ?? llmConfig.rewriteFallbackText,
        )
      },
      afterAgent: async () => {
        const matchedRecords = auditEntries.filter((entry) => entry.matched)
        const notification =
          matchedRecords.length > 0
            ? buildMatchedNotificationMessage({
                mode: 'llm',
                nodeTitle: context.node.title ?? SENSITIVE_FILTER_MIDDLEWARE_NAME,
                finalAction,
                records: matchedRecords,
                runtimeConfigurable,
                inputSnippet: latestInputSnippet,
              })
            : null

        const [persistResult, notifyResult] = await Promise.allSettled([
          persistAuditSnapshot(),
          notification ? dispatchWecomNotification(wecomConfig, notification) : Promise.resolve(undefined),
        ])

        if (persistResult.status === 'rejected') {
          console.warn(
            `[${SENSITIVE_FILTER_MIDDLEWARE_NAME}] Failed to persist audit snapshot: ${getErrorText(persistResult.reason)}`,
          )
        }
        if (notifyResult.status === 'rejected') {
          console.warn(
            `[${SENSITIVE_FILTER_MIDDLEWARE_NAME}] Failed to dispatch WeCom notification: ${getErrorText(notifyResult.reason)}`,
          )
        }
        return undefined
      },
    }
  }
}

export type { SensitiveFilterConfig }
