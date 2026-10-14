import type { MimoModelCredentials } from '../types.js';

interface MimoModelKwargs {
  thinking: { type: 'enabled' | 'disabled' };
  response_format?: { type: 'text' | 'json_object' };
  max_completion_tokens?: number;
}

function toResponseFormat(
  responseFormat: MimoModelCredentials['response_format']
): { type: 'text' | 'json_object' } | undefined {
  return responseFormat ? { type: responseFormat } : undefined;
}

export function buildMimoModelKwargs(credentials: MimoModelCredentials): MimoModelKwargs {
  const responseFormat = toResponseFormat(credentials.response_format);
  const kwargs: MimoModelKwargs = {
    thinking: {
      type: credentials.thinking ?? 'disabled',
    },
  };
  if (responseFormat) {
    kwargs.response_format = responseFormat;
  }
  if (typeof credentials.max_completion_tokens === 'number') {
    kwargs.max_completion_tokens = credentials.max_completion_tokens;
  }
  return kwargs;
}
