import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { z } from 'zod';
import { DeepSeekModule } from './deepseek.module.js';
import { SvgIcon } from './types.js';

const indexFileUrl = fileURLToPath(import.meta.url);
const indexFileDir = dirname(indexFileUrl);

const packageJson = JSON.parse(
  readFileSync(join(indexFileDir, '../package.json'), 'utf8')
) as {
  name: string;
  version: string;
};

const ConfigSchema = z.object({});

const plugin: XpertPlugin<any> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    category: 'model',
    icon: {
      type: 'svg',
      value: SvgIcon,
    },
    displayName: 'DeepSeek',
    description: 'Provide DeepSeek AI Models with Advanced Reasoning Capabilities',
    keywords: ['DeepSeek', 'model', 'llm', 'reasoning', 'R1'],
    author: 'XpertAI Team',
  },
  config: {
    schema: ConfigSchema as any,
  },
  register(ctx) {
    ctx.logger.log('register DeepSeek plugin');
    return { module: DeepSeekModule, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('DeepSeek plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('DeepSeek plugin stopped');
  },
};

export default plugin;
