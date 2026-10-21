import { readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const LLM_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const CONTEXT_SIZE = 1000000;
const MAX_COMPLETION_TOKENS = 131072;
const CURRENT_MODELS = [
  'mimo-v2.6-pro',
  'mimo-v2.6-flash',
  'mimo-v2.6-pro-ultraspeed',
] as const;
const DEPRECATED_MODELS = ['mimo-v2.5-pro', 'mimo-v2.5', 'mimo-v2-flash'] as const;
const UNCACHED_USD_PER_MILLION: Record<(typeof CURRENT_MODELS)[number], { input: string; output: string }> = {
  'mimo-v2.6-pro': { input: '0.435', output: '0.87' },
  'mimo-v2.6-flash': { input: '0.14', output: '0.28' },
  'mimo-v2.6-pro-ultraspeed': { input: '4.35', output: '8.7' },
};

interface ModelDocument {
  model: string;
  deprecated: boolean;
  text: string;
}

function readModelDocument(fileName: string): ModelDocument {
  const text = readFileSync(join(LLM_DIRECTORY, fileName), 'utf8');
  const modelMatch = text.match(/^model:\s*(\S+)\s*$/m);
  if (!modelMatch?.[1]) {
    throw new Error(`Missing model id in ${fileName}`);
  }
  return {
    model: modelMatch[1],
    deprecated: /^deprecated:\s*true\s*$/m.test(text),
    text,
  };
}

function readCatalog(): ModelDocument[] {
  return readdirSync(LLM_DIRECTORY)
    .filter((fileName) => fileName.endsWith('.yaml') && !fileName.startsWith('_'))
    .map((fileName) => readModelDocument(fileName));
}

function readPosition(): string[] {
  return readFileSync(join(LLM_DIRECTORY, '_position.yaml'), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2));
}

describe('Xiaomi MiMo catalog', () => {
  const catalog = readCatalog();

  it('orders the V2.6 models ahead of deprecated predecessors', () => {
    expect(readPosition()).toEqual([...CURRENT_MODELS, ...DEPRECATED_MODELS]);
    expect(catalog.map((model) => model.model).sort()).toEqual(
      [...CURRENT_MODELS, ...DEPRECATED_MODELS].sort()
    );
  });

  it('publishes verified V2.6 limits and uncached overseas prices', () => {
    for (const modelId of CURRENT_MODELS) {
      const model = catalog.find((entry) => entry.model === modelId);
      const pricing = UNCACHED_USD_PER_MILLION[modelId];
      expect(model?.deprecated).toBe(false);
      expect(model?.text).toContain(`context_size: ${CONTEXT_SIZE}`);
      expect(model?.text).toContain('default: 131072');
      expect(model?.text).toContain(`max: ${MAX_COMPLETION_TOKENS}`);
      expect(model?.text).toContain(`input: "${pricing.input}"`);
      expect(model?.text).toContain(`output: "${pricing.output}"`);
      expect(model?.text).toContain('unit: "0.000001"');
      expect(model?.text).toContain('currency: USD');
    }
  });

  it('keeps retired model schemas so saved configurations can still resolve', () => {
    for (const modelId of DEPRECATED_MODELS) {
      const model = catalog.find((entry) => entry.model === modelId);
      expect(model?.deprecated).toBe(true);
    }
  });
});
