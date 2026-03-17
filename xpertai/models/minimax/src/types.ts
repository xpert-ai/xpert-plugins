export const MiniMax = 'minimax';

export interface MiniMaxCredentials {
  api_key: string;
  group_id: string;
  base_url?: string;
}

export type MiniMaxModelCredentials = MiniMaxCredentials & {
  maxRetries?: number;
};

export const SUPPORTED_LLM_MODELS = [
  'MiniMax-M2.5',
  'MiniMax-M2.5-highspeed',
  'MiniMax-M2.1',
  'MiniMax-M2.1-highspeed',
  'MiniMax-M2',
  'M2-her',
  'minimax-m1'
];

export const SUPPORTED_EMBEDDING_MODELS = ['embo-01'];

export const SUPPORTED_TTS_MODELS = [
  'speech-2.8-hd',
  'speech-2.8-turbo',
  'speech-2.6-hd',
  'speech-2.6-turbo',
  'speech-02-hd',
  'speech-02-turbo'
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