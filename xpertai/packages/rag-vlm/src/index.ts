import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { z } from 'zod';
import { VlmDefaultPlugin } from './lib/vlm.module.js';
import { SvgIcon } from './lib/types.js';

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
    category: 'vlm',
    icon: {
      type: 'svg',
      value: SvgIcon
    },
    displayName: 'VLM Default',
    description: 'Provide VLM functionality using default settings',
    keywords: ['pdf', 'markdown', 'json', 'vlm', 'default'],
    author: 'XpertAI Team',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register VLM default plugin');
    return { module: VlmDefaultPlugin, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('vlm default plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('vlm default plugin stopped');
  },
};

export default plugin;