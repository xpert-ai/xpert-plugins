jest.mock('@xpert-ai/plugin-sdk', () => ({
  AIModelProviderStrategy: () => () => undefined,
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
  ModelProvider: class {},
  mergeCredentials: (
    credentials: Record<string, unknown>,
    modelProperties?: Record<string, unknown>
  ) => ({ ...credentials, ...modelProperties }),
}));

import { AiProviderRole } from '@xpert-ai/contracts';
import { buildLongcatModelKwargs } from './model-kwargs.js';
import { getLongcatBaseUrl, LongcatBaseUrl } from '../types.js';
import { LongcatLargeLanguageModel } from './llm.js';

function createCopilotModel(
  options: Record<string, unknown>
): Parameters<LongcatLargeLanguageModel['getChatModel']>[0] {
  return {
    model: 'longcat-flash-thinking',
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

describe('LongCat model adapter', () => {
  it('keeps the provider strategy as the Nest injection token', () => {
    const [dependency]: Array<{ name?: string }> = Reflect.getMetadata(
      'design:paramtypes',
      LongcatLargeLanguageModel
    );

    expect(dependency?.name).toBe('LongcatProviderStrategy');
  });

  it('normalizes the Dify-compatible endpoint', () => {
    expect(getLongcatBaseUrl({ api_key: 'test-key' })).toBe(LongcatBaseUrl);
    expect(
      getLongcatBaseUrl({
        api_key: 'test-key',
        endpoint_url: 'https://proxy.example.com/openai/',
      })
    ).toBe('https://proxy.example.com/openai');
  });

  it('passes thinking controls from the Dify model YAML', () => {
    expect(
      buildLongcatModelKwargs({
        api_key: 'test-key',
        temperature: 0,
        enable_thinking: 'true',
        thinking_budget: '4096',
      })
    ).toEqual({
      enable_thinking: true,
      thinking_budget: 4096,
    });
  });

  it('builds runtime request parameters without exposing the API key to error logs', () => {
    const llm = new LongcatLargeLanguageModel(
      {} as ConstructorParameters<typeof LongcatLargeLanguageModel>[0]
    );
    const errorCallback = jest.spyOn(
      llm,
      'createHandleLLMErrorCallbacks'
    );
    const model = llm.getChatModel(
      createCopilotModel({
        enable_thinking: true,
        thinking_budget: 4096,
      })
    );

    expect(model.clientConfig.apiKey).toBe('test-key');
    expect(model.invocationParams()).toEqual(
      expect.objectContaining({
        enable_thinking: true,
        thinking_budget: 4096,
      })
    );
    expect(errorCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: '[REDACTED]',
        model: 'longcat-flash-thinking',
      }),
      expect.anything()
    );
  });
});
