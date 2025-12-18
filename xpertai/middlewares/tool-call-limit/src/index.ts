import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ToolCallLimitPlugin } from './lib/tool-call-limit.module.js';
import { ToolCallLimitIcon } from './lib/types.js';

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
      type: 'svg',
      value: ToolCallLimitIcon,
    },
    displayName: 'Tool Call Limit Middleware',
    description: 'Track tool call counts and enforce limits during agent execution. Supports thread-level (persistent) and run-level (per invocation) limits with configurable exit behaviors.',
    keywords: ['agent', 'middleware', 'tool call'],
    author: 'XpertAI Team',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register tool call limit middleware plugin');
    return { module: ToolCallLimitPlugin, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('tool call limit middleware plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('tool call limit middleware plugin stopped');
  },
};

export default plugin;