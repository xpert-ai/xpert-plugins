import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { z } from 'zod';
import { ZAIModule } from './zai.module.js';
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
    displayName: 'Z.AI Models',
    description: 'Provide Z.AI (Zhipu Coding Plan) Models with Advanced Reasoning Capabilities',
    keywords: ['Z.AI', 'ZhipuAI', 'model', 'llm', 'reasoning', 'coding-plan'],
    author: 'XpertAI Team',
  },
  config: {
    schema: z.object({})
  },
  register(ctx) {
    ctx.logger.log('register Z.AI plugin');
    return { module: ZAIModule };
  },
  async onStart(ctx) {
    ctx.logger.log('Z.AI plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('Z.AI plugin stopped');
  },
};

export default plugin;
