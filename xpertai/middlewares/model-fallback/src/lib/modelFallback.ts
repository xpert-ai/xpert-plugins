import { z } from "zod/v3";
import { z as z4 } from "zod/v4";
import { Injectable, Logger } from "@nestjs/common";
import {
  AgentMiddlewareStrategy,
  IAgentMiddlewareStrategy,
  AgentBuiltInState,
  IAgentMiddlewareContext,
  ModelRequest,
  WrapModelCallHandler,
  type AgentMiddlewareEvent,
} from "@xpert-ai/plugin-sdk";
import { AiModelTypeEnum } from "@xpert-ai/contracts";
import type {
  TAgentMiddlewareMeta,
  ICopilotModel,
  JsonSchemaObjectType,
  TAgentRunnableConfigurable,
} from "@xpert-ai/contracts";
import { BaseLanguageModel } from "@langchain/core/language_models/base";
import { AIMessage } from "@langchain/core/messages";
import { ModelFallbackIcon } from "./types.js";

/**
 * Configuration Schema Definition
 *
 * 【Requirement】All configurations are fallback model arrays:
 * - fallbackModels: List of fallback models (at least one), tried in sequence
 */
export type ModelFallbackMiddlewareConfig = {
  fallbackModels: ICopilotModel[];
};

const modelFallbackSchema = z.object({
  fallbackModels: z.array(z.unknown()).nonempty(),
});

type ModelFallbackEventPhase =
  | 'fallback_started'
  | 'fallback_succeeded'
  | 'fallback_failed'

type ModelFallbackMiddlewareEvent = AgentMiddlewareEvent & {
  phase: ModelFallbackEventPhase
  status: NonNullable<AgentMiddlewareEvent['status']>
  message: string
  data?: Record<string, unknown>
}

/**
 * Model Fallback Middleware
 * 
 * Automatic fallback to alternative models on errors.
 * Retries failed model calls with alternative models in sequence until
 * success or all models exhausted. Primary model specified in Agent configuration.
 */
@Injectable()
@AgentMiddlewareStrategy("ModelFallbackMiddleware")
export class ModelFallbackMiddleware implements IAgentMiddlewareStrategy {
  private readonly logger = new Logger(ModelFallbackMiddleware.name)

  readonly meta: TAgentMiddlewareMeta = {
    name: "ModelFallbackMiddleware",
    label: {
      en_US: "Model Fallback Middleware",
      zh_Hans: "模型回退中间件",
    },
    icon: {
      type: "svg",
      value: ModelFallbackIcon,
      color: "#673AB7",
    },
    description: {
      en_US:
        "Automatically fallback to alternative models when the primary model fails. Useful for handling model outages, cost optimization, and provider redundancy.",
      zh_Hans:
        "当主模型失败时自动回退到备用模型。用于处理模型故障、成本优化和提供商冗余。",
    },
    configSchema: {
      type: 'object',
      properties: {
        fallbackModels: {
          type: 'array',
          'x-ui': {
            span: 2
          },
          title: {
            en_US: 'Fallback Models',
            zh_Hans: '备用模型',
          },
          description: {
            en_US:
              'Fallback models to try in order when the primary model fails.',
            zh_Hans: '主模型失败时按顺序尝试的备用模型列表。',
          },
          default: [{}],
          minItems: 1,
          items: {
            type: 'object',
            default: {},
            'x-ui': {
              component: 'ai-model-select',
              span: 12,
              inputs: {
                modelType: AiModelTypeEnum.LLM,
                hiddenLabel: true,
              },
            },
          },
        } as unknown as JsonSchemaObjectType['properties'][string],
      },
      required: ['fallbackModels'],
    },
  }

  async createMiddleware(
    options: ModelFallbackMiddlewareConfig,
    context: IAgentMiddlewareContext
  ) {
    const result = modelFallbackSchema.safeParse(options);
    if (!result.success) {
      throw new Error(
        `Invalid model fallback middleware options: ${z4.prettifyError(result.error)}`
      );
    }
    const userOptions = result.data as ModelFallbackMiddlewareConfig;

    return {
      name: "ModelFallbackMiddleware",
      wrapModelCall: async (
        request: ModelRequest<AgentBuiltInState>,
        handler: WrapModelCallHandler,
      ): Promise<AIMessage> => {
        // Try primary model first
        let lastException: Error;
        try {
          // TODO: Test - Force trigger error to test fallback models
          // Uncomment the following line to automatically make the main model unusable.
          // if (process.env['FORCE_MODEL_ERROR'] === 'true') {
          //   throw new Error('Forced error to test fallback models');
          // }
          // throw new Error('Test: Skipping primary model to test fallback');
          // Test: Temporarily comment out the following line for testing
          return await handler(request);
          
        } catch (error) {
          lastException = this.normalizeError(error);
        }

        // Try fallback models in sequence
        for (const [index, fallbackModel] of userOptions.fallbackModels.entries()) {
          const attempt = index + 1
          await this.emitMiddlewareEvent(context, request, {
            phase: 'fallback_started',
            status: 'running',
            message: `Trying fallback model ${attempt}/${userOptions.fallbackModels.length}`,
            data: {
              attempt,
              totalAttempts: userOptions.fallbackModels.length,
              model: fallbackModel.model,
              provider: this.readModelProvider(fallbackModel),
            },
          })

          try {
            const fallbackModelInstance = await context.runtime.createModelClient<BaseLanguageModel>(fallbackModel, {
              usageCallback: (event) => {
                console.log(
                  `[Middleware ModelFallback] Model ${fallbackModel.model} Usage:`,
                  event
                );
              },
            });

            const result = await handler({
              ...request,
              model: fallbackModelInstance,
            });

            await this.emitMiddlewareEvent(context, request, {
              phase: 'fallback_succeeded',
              status: 'success',
              message: `Fallback model succeeded ${attempt}/${userOptions.fallbackModels.length}`,
              data: {
                attempt,
                totalAttempts: userOptions.fallbackModels.length,
                model: fallbackModel.model,
                provider: this.readModelProvider(fallbackModel),
              },
            })

            return result;
          } catch (error) {
            lastException = this.normalizeError(error);
            await this.emitMiddlewareEvent(context, request, {
              phase: 'fallback_failed',
              status: 'fail',
              message: `Fallback model failed ${attempt}/${userOptions.fallbackModels.length}`,
              error: this.serializeError(lastException),
              data: {
                attempt,
                totalAttempts: userOptions.fallbackModels.length,
                model: fallbackModel.model,
                provider: this.readModelProvider(fallbackModel),
              },
            })
            continue;
          }
        }

        // All models failed, re-raise the last exception
        throw lastException;
      },
    };
  }

  private async emitMiddlewareEvent(
    context: IAgentMiddlewareContext,
    request: ModelRequest<AgentBuiltInState>,
    event: ModelFallbackMiddlewareEvent
  ) {
    const emit = context.runtime.emitMiddlewareEvent
    if (typeof emit !== 'function') return

    const configurable = request.runtime?.configurable as
      | Partial<TAgentRunnableConfigurable>
      | undefined

    try {
      const payload: AgentMiddlewareEvent = {
        middlewareName: 'ModelFallbackMiddleware',
        middlewareKey: context.node?.key,
        title: 'Model fallback',
        ...event,
        ...(typeof configurable?.executionId === 'string'
          ? { executionId: configurable.executionId }
          : {}),
        ...(typeof configurable?.thread_id === 'string'
          ? { threadId: configurable.thread_id }
          : {}),
      }
      await emit.call(context.runtime, payload)
    } catch (error) {
      this.logger.debug(
        `Failed to emit model fallback middleware event: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  private normalizeError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error))
  }

  private serializeError(error: Error) {
    return {
      name: error.name || error.constructor.name || 'Error',
      message: error.message,
    }
  }

  private readModelProvider(model: ICopilotModel) {
    const record = model as unknown as Record<string, unknown>
    const provider = record.provider ?? record.providerName ?? record._provider ?? record._providerName
    return typeof provider === 'string' && provider.trim() ? provider.trim() : undefined
  }
}
