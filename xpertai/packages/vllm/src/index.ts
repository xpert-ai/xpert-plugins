import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { z } from 'zod';
import { SvgIcon } from './types.js';
import { VLLMPlugin } from './vllm.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')) as {
  name: string;
  version: string;
};

const ConfigSchema = z.object({
});

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    category: 'model',
    icon: {
      type: 'svg',
      value: SvgIcon
    },
    displayName: 'vLLM',
    description: 'Provide connector for vLLM models',
    keywords: ['vLLM', 'model'],
    author: 'XpertAI',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register VLLM plugin');
    return { module: VLLMPlugin, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('VLLM plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('VLLM plugin stopped');
  },
};

export default plugin;