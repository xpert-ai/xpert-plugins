import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { z } from 'zod';
import { ZhipuAIModule } from './zhipu.module.js';
import { SvgIcon } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf8')
) as {
  name: string;
  version: string;
};

const plugin: XpertPlugin<any> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    category: 'model',
    icon: {
      type: 'svg',
      value: SvgIcon,
    },
    displayName: 'ZhipuAI Models',
    description: 'Provide ZhipuAI Models with Advanced Reasoning Capabilities',
    keywords: ['ZhipuAI', 'model', 'llm', 'reasoning'],
    author: 'XpertAI Team',
  },
  config: {
    schema: z.object({})
  },
  register(ctx) {
    ctx.logger.log('register ZhipuAI plugin');
    return { module: ZhipuAIModule };
  },
  async onStart(ctx) {
    ctx.logger.log('ZhipuAI plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('ZhipuAI plugin stopped');
  },
};

export default plugin;
