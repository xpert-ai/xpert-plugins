import { ClientOptions, OpenAIBaseInput } from '@langchain/openai';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);

export const Moonshot = 'moonshot';
export const MoonshotBaseUrl = 'https://api.moonshot.cn/v1';

export const SvgIcon = readFileSync(
  join(currentDirectory, '_assets/icon_s_en.svg'),
  'utf8'
);

export type MoonshotCredentials = {
  api_key: string;
  endpoint_url?: string;
  base_url?: string;
};

export type MoonshotModelCredentials = MoonshotCredentials & {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
};

export function getMoonshotBaseUrl(credentials: MoonshotCredentials): string {
  return (
    credentials.endpoint_url?.trim() ||
    credentials.base_url?.trim() ||
    MoonshotBaseUrl
  );
}

export function toCredentialKwargs(
  credentials: MoonshotCredentials,
  model?: string
) {
  const credentialsKwargs: OpenAIBaseInput = {
    apiKey: credentials.api_key,
    model: model,
  } as OpenAIBaseInput;
  const configuration: ClientOptions = {
    baseURL: getMoonshotBaseUrl(credentials),
  };

  return {
    ...credentialsKwargs,
    configuration,
  };
}
