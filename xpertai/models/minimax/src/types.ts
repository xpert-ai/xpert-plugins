import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const moduleDir = dirname(fileURLToPath(import.meta.url));

export const MiniMax = 'minimax';
const MiniMaxIconPngBase64 = readFileSync(join(moduleDir, '_assets/icon_s_en.png')).toString('base64');

export const SvgIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <image width="24" height="24" href="data:image/png;base64,${MiniMaxIconPngBase64}"/>
</svg>`;

export interface MiniMaxCredentials {
  api_key: string;
  group_id: string;
  base_url?: string;
}

export type MiniMaxModelCredentials = MiniMaxCredentials & {
  maxRetries?: number;
};

export const SUPPORTED_LLM_MODELS = [
  'MiniMax-M2',
  'MiniMax-M2-Stable',
  'abab7-chat-preview',
  'abab6.5-chat',
  'abab6.5s-chat',
  'abab6.5t-chat',
  'abab6-chat',
  'abab5.5-chat',
  'abab5.5s-chat',
  'abab5-chat',
  'minimax-text-01',
  'minimax-m1'
];

export const SUPPORTED_EMBEDDING_MODELS = ['embo-01', 'text-embedding-ada-002'];

export const SUPPORTED_TTS_MODELS = [
  'speech-01',
  'speech-01-hd',
  'speech-01-turbo',
  'speech-02',
  'speech-02-hd',
  'speech-02-turbo',
  'tts-1',
  'tts-1-hd'
];

export function toCredentialKwargs(credentials: MiniMaxCredentials, model?: string) {
  const baseURL = credentials.base_url || 'https://api.minimaxi.com';
  return {
    apiKey: credentials.api_key,
    groupId: credentials.group_id,
    model: model ?? null,
    configuration: {
      baseURL: baseURL.endsWith('/v1') ? baseURL : `${baseURL}/v1`
    }
  };
}
