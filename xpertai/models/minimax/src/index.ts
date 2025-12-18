import { readFileSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { MiniMaxModule } from './minimax.module.js';

const pkg = JSON.parse(
  readFileSync(join(process.cwd(), 'package.json'), 'utf8')
) as { name: string; version: string };

const ConfigSchema = z.object({
  api_key: z.string().min(1, 'API Key is required'),
  group_id: z.string().min(1, 'Group ID is required'),
  base_url: z.string().url().optional().describe('Optional base URL, defaults to https://api.minimaxi.com')
});

const SvgIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect width="24" height="24" rx="6" fill="#111827"/>
<path d="M12 4C12 4 8 8 8 12C8 16 12 20 12 20C12 20 16 16 16 12C16 8 12 4 12 4Z" fill="white" fill-opacity="0.88"/>
<path d="M12 8C10 8 8 10 8 12C8 14 10 16 12 16C14 16 16 14 16 12C16 10 14 8 12 8Z" fill="white"/>
</svg>`;

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
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
  config: { schema: ConfigSchema },
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

export { ConfigSchema };
export default plugin;
