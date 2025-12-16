import { ClientOptions, OpenAIBaseInput } from '@langchain/openai';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const Moonshot = 'moonshot';
export const MoonshotBaseUrl = 'https://api.moonshot.cn/v1';

export const SvgIcon = readFileSync(join(__dirname, '_assets/icon_s_en.svg'), 'utf8');

export type MoonshotCredentials = {
  api_key: string;
  base_url?: string;
};

export type MoonshotModelCredentials = MoonshotCredentials & {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
};

export function toCredentialKwargs(
  credentials: MoonshotCredentials,
  model?: string
) {
  const credentialsKwargs: OpenAIBaseInput = {
    apiKey: credentials.api_key,
    model: model,
  } as OpenAIBaseInput;
  const configuration: ClientOptions = {
    baseURL: credentials.base_url || MoonshotBaseUrl,
  };

  return {
    ...credentialsKwargs,
    configuration,
  };
}

