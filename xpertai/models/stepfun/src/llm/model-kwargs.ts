import type { StepfunModelCredentials } from '../types.js';

type JsonSchema = Record<string, unknown>;

function parseJsonSchema(value: string | JsonSchema): JsonSchema {
  if (typeof value === 'string') {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('JSON Schema must be an object');
    }
    return parsed as JsonSchema;
  }
  return value;
}

function toResponseFormat(
  responseFormat: StepfunModelCredentials['response_format'],
  jsonSchema?: StepfunModelCredentials['json_schema']
) {
  if (!responseFormat) {
    return undefined;
  }
  if (responseFormat === 'json_schema') {
    if (!jsonSchema) {
      return { type: 'json_schema' };
    }
    return {
      type: 'json_schema',
      json_schema: {
        name: 'response',
        schema: parseJsonSchema(jsonSchema),
      },
    };
  }
  return { type: responseFormat };
}

export function buildStepfunModelKwargs(
  credentials: StepfunModelCredentials
) {
  return {
    reasoning_format: 'deepseek-style',
    ...(credentials.reasoning_effort
      ? { reasoning_effort: credentials.reasoning_effort }
      : {}),
    ...(credentials.response_format
      ? {
          response_format: toResponseFormat(
            credentials.response_format,
            credentials.json_schema
          ),
        }
      : {}),
  };
}
