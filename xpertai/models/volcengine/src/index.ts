import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { VolcenginePlugin } from './volcengine.js';
import { SvgIcon } from './types.js';

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
    displayName: 'volcengine',
    description: 'Provide VLM functionality using default settings',
    keywords: ['pdf', 'markdown', 'json', 'vlm', 'default'],
    author: 'XpertAI Team',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register volcengine plugin');
    return { module: VolcenginePlugin, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('volcengine plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('volcengine plugin stopped');
  },
};

export default plugin;