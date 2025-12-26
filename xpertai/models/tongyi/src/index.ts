import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { z } from 'zod';
import { TongyiProviderModule } from './tongyi.module.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf8')
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
      value: ''
    },
    displayName: 'Tongyi',
    description: 'Provide Tongyi Models',
    keywords: ['Tongyi', 'model', 'llm'],
    author: 'XpertAI Team',
  },
  config: {
    schema: ConfigSchema as any,
  },
  register(ctx) {
    ctx.logger.log('register Tongyi plugin');
    return { module: TongyiProviderModule, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('Tongyi plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('Tongyi plugin stopped');
  },
};

export default plugin;
