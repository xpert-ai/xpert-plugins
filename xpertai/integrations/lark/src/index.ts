import { z } from 'zod';
import { type XpertPlugin } from '@xpert-ai/plugin-sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initI18n } from './lib/i18n.js';
import { LarkModule } from './lib/lark.module.js';
import { iconImage } from './lib/types.js';

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
    category: 'integration',
    icon: {
      type: 'image',
      value: iconImage
    },
    displayName: 'Lark Plugin',
    description: 'Integrate Lark functionality',
    keywords: ['lark', 'feishu', 'document source', 'knowledge', 'integration'],
    author: 'XpertAI team',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register lark plugin');
    initI18n(join(__dirname, '../src'));
    return { module: LarkModule, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('lark plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('lark plugin stopped');
  },
};

export default plugin;