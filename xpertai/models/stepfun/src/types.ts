import type { ClientOptions, OpenAIBaseInput } from '@langchain/openai';
import type { CommonChatModelParameters } from '@xpert-ai/plugin-sdk';

export const Stepfun = 'stepfun';
export const StepfunBaseUrl = 'https://api.stepfun.com/v1';

export interface StepfunCredentials {
  api_key: string;
}

export interface StepfunModelCredentials
  extends StepfunCredentials,
    CommonChatModelParameters {
  top_p?: number;
  max_tokens?: number;
  reasoning_effort?: 'low' | 'medium' | 'high';
  response_format?: 'text' | 'json_object' | 'json_schema';
  json_schema?: string | Record<string, unknown>;
  streaming?: boolean;
}

export function toCredentialKwargs(
  credentials: StepfunModelCredentials,
  model?: string
): OpenAIBaseInput & { configuration: ClientOptions } {
  return {
    apiKey: credentials.api_key,
    model,
    streaming: credentials.streaming,
    temperature: credentials.temperature,
    topP: credentials.top_p,
    configuration: {
      baseURL: StepfunBaseUrl,
    },
  } as OpenAIBaseInput & { configuration: ClientOptions };
}
