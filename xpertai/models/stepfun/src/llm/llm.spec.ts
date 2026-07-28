jest.mock('@xpert-ai/plugin-sdk', () => ({
  ChatOAICompatReasoningModel: class {
    constructor(readonly clientConfig: Record<string, unknown>) {}

    invocationParams() {
      return {
        ...this.clientConfig,
        ...((this.clientConfig['modelKwargs'] as Record<string, unknown>) ?? {}),
      };
    }
  },
  CredentialsValidateFailedError: class extends Error {},
  getErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
  LargeLanguageModel: class {
    createHandleUsageCallbacks() {
      return [];
    }

    createHandleLLMErrorCallbacks() {
      return {};
    }
  },
  mergeCredentials: (
    credentials: Record<string, unknown>,
    modelProperties?: Record<string, unknown>
  ) => ({ ...credentials, ...modelProperties }),
}));

import { AiProviderRole } from '@xpert-ai/contracts';
import { buildStepfunModelKwargs } from './model-kwargs.js';
import { StepfunBaseUrl, toCredentialKwargs } from '../types.js';
import { StepfunLargeLanguageModel } from './llm.js';

function createCopilotModel(
  options: Record<string, unknown>
): Parameters<StepfunLargeLanguageModel['getChatModel']>[0] {
  return {
    model: 'step-3.7-flash',
    options,
    copilot: {
      role: AiProviderRole.Primary,
      modelProvider: {
        credentials: {
          api_key: 'test-key',
        },
      },
    },
  };
}

describe('StepFun model adapter', () => {
  it('uses the official StepFun endpoint', () => {
    const params = toCredentialKwargs(
      { api_key: 'test-key', temperature: 0 },
      'step-3.7-flash'
    );

    expect(params.configuration.baseURL).toBe(StepfunBaseUrl);
    expect(params.model).toBe('step-3.7-flash');
  });

  it('passes Dify reasoning and structured-output parameters', () => {
    expect(
      buildStepfunModelKwargs({
        api_key: 'test-key',
        temperature: 0,
        reasoning_effort: 'high',
        response_format: 'json_schema',
        json_schema: '{"type":"object"}',
      })
    ).toEqual({
      reasoning_format: 'deepseek-style',
      reasoning_effort: 'high',
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'response',
          schema: { type: 'object' },
        },
      },
    });
  });

  it('builds runtime request parameters without exposing the API key to error logs', () => {
    const llm = new StepfunLargeLanguageModel(
      {} as ConstructorParameters<typeof StepfunLargeLanguageModel>[0]
    );
    const errorCallback = jest.spyOn(
      llm,
      'createHandleLLMErrorCallbacks'
    );
    const model = llm.getChatModel(
      createCopilotModel({
        reasoning_effort: 'high',
        response_format: 'json_schema',
        json_schema: '{"type":"object"}',
      })
    );

    expect(model.clientConfig.apiKey).toBe('test-key');
    expect(model.invocationParams()).toEqual(
      expect.objectContaining({
        reasoning_format: 'deepseek-style',
        reasoning_effort: 'high',
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'response',
            schema: { type: 'object' },
          },
        },
      })
    );
    expect(errorCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: '[REDACTED]',
        model: 'step-3.7-flash',
      }),
      expect.anything()
    );
  });
});
