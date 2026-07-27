import type { ClientOptions, OpenAIBaseInput } from '@langchain/openai';
import type { CommonChatModelParameters } from '@xpert-ai/plugin-sdk';

export const Longcat = 'longcat';
export const LongcatBaseUrl = 'https://api.longcat.chat/openai';

export interface LongcatCredentials {
  api_key: string;
  endpoint_url?: string;
}

export interface LongcatModelCredentials
  extends LongcatCredentials,
    CommonChatModelParameters {
  top_p?: number;
  max_tokens?: number;
  enable_thinking?: boolean | string;
  thinking_budget?: number | string;
  streaming?: boolean;
}

export function getLongcatBaseUrl(credentials: LongcatCredentials): string {
  return credentials.endpoint_url?.trim().replace(/\/+$/, '') || LongcatBaseUrl;
}

export function toCredentialKwargs(
  credentials: LongcatModelCredentials,
  model?: string
): OpenAIBaseInput & { configuration: ClientOptions } {
  return {
    apiKey: credentials.api_key,
    model,
    streaming: credentials.streaming,
    temperature: credentials.temperature,
    topP: credentials.top_p,
    configuration: {
      baseURL: getLongcatBaseUrl(credentials),
    },
  } as OpenAIBaseInput & { configuration: ClientOptions };
}
