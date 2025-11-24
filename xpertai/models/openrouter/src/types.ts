import { ClientOptions, OpenAIBaseInput } from '@langchain/openai';

export const OpenRouterAiBaseUrl = 'https://openrouter.ai/api/v1';

export type OpenRouterCredentials = {
  api_key: string;
};

export type OpenRouterModelCredentials = {
  api_key?: string;
  mode?: 'completion' | 'chat';
  context_size?: string;
  max_tokens_to_sample?: string;
  vision_support?: 'support' | 'no_support';
  function_calling_type?: 'no_call' | 'tool_call';
};

export function toCredentialKwargs(
  credentials: OpenRouterModelCredentials,
  model?: string
) {
  const credentialsKwargs: OpenAIBaseInput = {
    apiKey: credentials.api_key,
    model: model,
  } as OpenAIBaseInput;
  const configuration: ClientOptions = {
    baseURL: OpenRouterAiBaseUrl,
  };

  return {
    ...credentialsKwargs,
    configuration,
  };
}
