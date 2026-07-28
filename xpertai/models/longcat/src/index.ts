import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { LongcatModule } from './longcat.module.js';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  readFileSync(join(moduleDir, '../package.json'), 'utf8')
) as { name: string; version: string };
const icon = readFileSync(join(moduleDir, '_assets/icon_s_en.svg')).toString('base64');
const ConfigSchema = z.object({});

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    category: 'model',
    icon: {
      type: 'image',
      value: `data:image/svg+xml;base64,${icon}`,
    },
    displayName: 'LongCat',
    description: 'Provide LongCat chat and reasoning models',
    keywords: ['LongCat', 'llm', 'agent', 'reasoning'],
    author: 'XpertAI Team',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register LongCat plugin');
    return { module: LongcatModule, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('LongCat plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('LongCat plugin stopped');
  },
};

export default plugin;
