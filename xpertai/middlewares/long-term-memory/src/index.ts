import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { LongTermMemoryPlugin } from './lib/long-term-memory.module.js';
import { LongTermMemoryIcon } from './lib/types.js';

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
    category: 'middleware',
    icon: {
      type: 'base64',
      value: LongTermMemoryIcon,
    },
    displayName: 'Long-term Memory Middleware',
    description: 'Retrieve relevant long-term memories and inject them into the system prompt. Supports profile memory and Q&A memory types.',
    keywords: ['agent', 'middleware', 'memory', 'long-term memory', 'context'],
    author: 'XpertAI Team',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register long-term memory middleware plugin');
    return { module: LongTermMemoryPlugin, global: false };
  },
  async onStart(ctx) {
    ctx.logger.log('long-term memory middleware plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('long-term memory middleware plugin stopped');
  },
};

export default plugin;
