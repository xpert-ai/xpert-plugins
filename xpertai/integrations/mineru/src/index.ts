import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { MinerUPlugin } from './lib/mineru.plugin.js';
import { icon } from './lib/types.js';

const __filename = fileURLToPath(import.meta.url);
const dir_name = dirname(__filename);

const packageJson = JSON.parse(readFileSync(join(dir_name, '../package.json'), 'utf8')) as {
  name: string;
  version: string;
};

const ConfigSchema = z.object({
});

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    category: 'tools',
    icon: {
      type: 'svg',
      value: icon
    },
    displayName: 'MinerU Transformer',
    description: 'Provide PDF to Markdown and JSON transformation functionality',
    keywords: ['integration', 'pdf', 'markdown', 'json', 'transformer'],
    author: 'XpertAI Team',
    homepage: 'https://www.npmjs.com/package/@xpert-ai/plugin-mineru',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register mineru transformer plugin');
    return { module: MinerUPlugin, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('mineru transformer plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('mineru transformer plugin stopped');
  },
};

export default plugin;