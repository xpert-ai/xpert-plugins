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
import { buildMimoModelKwargs } from './model-kwargs.js';
import { getMimoBaseUrl, MimoBaseUrl } from '../types.js';
import { MimoLargeLanguageModel } from './llm.js';

function createCopilotModel(
  options: Record<string, unknown>
): Parameters<MimoLargeLanguageModel['getChatModel']>[0] {
  return {
    model: 'mimo-v2.5',
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

describe('Xiaomi MiMo model adapter', () => {
  it('uses the official endpoint unless a Dify-supported endpoint is selected', () => {
    expect(getMimoBaseUrl({ api_key: 'test-key' })).toBe(MimoBaseUrl);
    expect(
      getMimoBaseUrl({
        api_key: 'test-key',
        endpoint_url: 'https://token-plan-cn.xiaomimimo.com/v1/',
      })
    ).toBe('https://token-plan-cn.xiaomimimo.com/v1');
  });

  it('converts the Dify thinking selector to the API body shape', () => {
    expect(
      buildMimoModelKwargs({
        api_key: 'test-key',
        temperature: 0,
        thinking: 'enabled',
        response_format: 'json_object',
      })
    ).toEqual({
      thinking: { type: 'enabled' },
      response_format: { type: 'json_object' },
    });
  });

  it('builds runtime request parameters without exposing the API key to error logs', () => {
    const llm = new MimoLargeLanguageModel(
      {} as ConstructorParameters<typeof MimoLargeLanguageModel>[0]
    );
    const errorCallback = jest.spyOn(
      llm,
      'createHandleLLMErrorCallbacks'
    );
    const model = llm.getChatModel(
      createCopilotModel({
        thinking: 'enabled',
        response_format: 'json_object',
      })
    );

    expect(model.clientConfig.apiKey).toBe('test-key');
    expect(model.invocationParams()).toEqual(
      expect.objectContaining({
        thinking: { type: 'enabled' },
        response_format: { type: 'json_object' },
      })
    );
    expect(errorCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: '[REDACTED]',
        model: 'mimo-v2.5',
      }),
      expect.anything()
    );
  });
});
