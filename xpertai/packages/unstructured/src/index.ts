import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { z } from 'zod';
import { UnstructuredPlugin } from './lib/unstructured.module.js';
import { icon } from './lib/types.js';

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
    category: 'set',
    icon: {
      type: 'svg',
      value: icon
    },
    displayName: 'Unstructured Transformer',
    description: 'Provide PDF to Markdown and JSON transformation functionality',
    keywords: ['pdf', 'markdown', 'json', 'transformer'],
    author: 'XpertAI Team',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register unstructured transformer plugin');
    return { module: UnstructuredPlugin, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('unstructured transformer plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('unstructured transformer plugin stopped');
  },
};

export default plugin;