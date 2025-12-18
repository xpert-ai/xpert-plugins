import { ClientOptions, OpenAIBaseInput } from '@langchain/openai';

export const DeepSeek = 'deepseek';
export const DeepSeekBaseUrl = 'https://api.deepseek.com/v1';

export const SvgIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect width="24" height="24" rx="6" fill="#0F172A"/>
<path d="M12 6L8 10H11V14H13V10H16L12 6Z" fill="#3B82F6"/>
<path d="M8 16H16V18H8V16Z" fill="#3B82F6"/>
</svg>`;

export type DeepSeekCredentials = {
  api_key: string;
  base_url?: string;
};

export type DeepSeekModelCredentials = DeepSeekCredentials & {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
};

export function toCredentialKwargs(
  credentials: DeepSeekCredentials,
  model?: string
) {
  const credentialsKwargs: OpenAIBaseInput = {
    apiKey: credentials.api_key,
    model: model,
  } as OpenAIBaseInput;
  const configuration: ClientOptions = {
    baseURL: credentials.base_url || DeepSeekBaseUrl,
  };

  return {
    ...credentialsKwargs,
    configuration,
  };
}
