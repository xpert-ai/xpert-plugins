import type { LongcatModelCredentials } from '../types.js';

function toBoolean(value: boolean | string): boolean {
  return value === true || value === 'true';
}

export function buildLongcatModelKwargs(
  credentials: LongcatModelCredentials
) {
  const enableThinking =
    credentials.enable_thinking === undefined
      ? true
      : toBoolean(credentials.enable_thinking);

  return {
    thinking: {
      type: enableThinking ? 'enabled' : 'disabled',
    },
  };
}
