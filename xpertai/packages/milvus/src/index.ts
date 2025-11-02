import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { z } from 'zod';
import { MilvusPlugin } from './lib/milvus.plugin.js';
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
    category: 'vector-store',
    icon: {
      type: 'svg',
      value: icon
    },
    displayName: 'Milvus',
    description: 'Provide Milvus vector store functionality',
    keywords: ['milvus', 'vector', 'store'],
    author: 'XpertAI Team',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register Milvus plugin');
    return { module: MilvusPlugin, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('Milvus plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('Milvus plugin stopped');
  },
};

export default plugin;