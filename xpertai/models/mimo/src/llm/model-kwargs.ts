import type { MimoModelCredentials } from '../types.js';

function toResponseFormat(
  responseFormat: MimoModelCredentials['response_format']
) {
  return responseFormat ? { type: responseFormat } : undefined;
}

export function buildMimoModelKwargs(credentials: MimoModelCredentials) {
  return {
    thinking: {
      type: credentials.thinking ?? 'disabled',
    },
    ...(credentials.response_format
      ? { response_format: toResponseFormat(credentials.response_format) }
      : {}),
  };
}
