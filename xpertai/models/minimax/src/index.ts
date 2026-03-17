import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { MiniMaxModule } from './minimax.module.js';
import { SvgIcon } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pkg = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf8')
) as { name: string; version: string };

const plugin: XpertPlugin<any> = {
  meta: {
    name: pkg.name,
    version: pkg.version,
    category: 'model',
    icon: { type: 'svg', value: SvgIcon },
    displayName: 'MiniMax',
    description: 'MiniMax LLM / Embedding / TTS via OpenAI compatible API',
    keywords: ['minimax', 'openai-compatible', 'llm', 'embedding', 'tts'],
    author: 'XpertAI Team'
  },
  config: {
    schema: z.object({})
  },
  register(ctx) {
    ctx.logger.log('Register MiniMax plugin');
    return { module: MiniMaxModule, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('MiniMax plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('MiniMax plugin stopped');
  }
};

export default plugin;
