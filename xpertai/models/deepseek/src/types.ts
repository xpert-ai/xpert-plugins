import { ClientOptions, OpenAIBaseInput } from '@langchain/openai';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const DeepSeek = 'deepseek';
export const DeepSeekBaseUrl = 'https://api.deepseek.com/v1';

export const SvgIcon = readFileSync(join(__dirname, '_assets/icon_s_en.svg'), 'utf8');

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
