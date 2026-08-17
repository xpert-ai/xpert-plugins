import { ClientOptions, OpenAIBaseInput } from '@langchain/openai';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
export const SvgIcon = readFileSync(join(currentDirectory, '_assets/openrouter_square.svg'), 'utf8');

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
