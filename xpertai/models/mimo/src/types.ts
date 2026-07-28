import type { ClientOptions, OpenAIBaseInput } from '@langchain/openai';
import type { CommonChatModelParameters } from '@xpert-ai/plugin-sdk';

export const Mimo = 'mimo';
export const MimoBaseUrl = 'https://api.xiaomimimo.com/v1';

export interface MimoCredentials {
  api_key: string;
  endpoint_url?: string;
}

export interface MimoModelCredentials
  extends MimoCredentials,
    CommonChatModelParameters {
  top_p?: number;
  thinking?: 'enabled' | 'disabled';
  response_format?: 'text' | 'json_object';
  streaming?: boolean;
}

export function getMimoBaseUrl(credentials: MimoCredentials): string {
  return credentials.endpoint_url?.trim().replace(/\/+$/, '') || MimoBaseUrl;
}

export function toCredentialKwargs(
  credentials: MimoModelCredentials,
  model?: string
): OpenAIBaseInput & { configuration: ClientOptions } {
  return {
    apiKey: credentials.api_key,
    model,
    streaming: credentials.streaming,
    temperature: credentials.temperature,
    topP: credentials.top_p,
    configuration: {
      baseURL: getMimoBaseUrl(credentials),
    },
  } as OpenAIBaseInput & { configuration: ClientOptions };
}
