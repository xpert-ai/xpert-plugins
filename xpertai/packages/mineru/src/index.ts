import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { readFileSync } from 'fs';
import { join } from 'path';
import { MinerUPlugin } from './lib/mineru.plugin.js';
import { icon } from './lib/types.js';
import { getModuleMeta } from './lib/path-meta.js';

const { __filename, __dirname } = getModuleMeta(import.meta);

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
    category: 'set',
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