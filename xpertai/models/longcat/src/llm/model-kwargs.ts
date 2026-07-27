import type { LongcatModelCredentials } from '../types.js';

function toBoolean(value: boolean | string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value === true || value === 'true';
}

function toFiniteNumber(value: number | string | undefined): number | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function buildLongcatModelKwargs(
  credentials: LongcatModelCredentials
) {
  const enableThinking = toBoolean(credentials.enable_thinking);
  const thinkingBudget = toFiniteNumber(credentials.thinking_budget);
  return {
    ...(enableThinking === undefined
      ? {}
      : { enable_thinking: enableThinking }),
    ...(thinkingBudget === undefined
      ? {}
      : { thinking_budget: thinkingBudget }),
  };
}
