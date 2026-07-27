import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { MimoModule } from './mimo.module.js';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  readFileSync(join(moduleDir, '../package.json'), 'utf8')
) as { name: string; version: string };
const icon = readFileSync(join(moduleDir, '_assets/icon_s_en.png')).toString('base64');
const ConfigSchema = z.object({});

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    category: 'model',
    icon: {
      type: 'image',
      value: `data:image/png;base64,${icon}`,
    },
    displayName: 'Xiaomi MiMo',
    description: 'Provide Xiaomi MiMo agent and coding models',
    keywords: ['Xiaomi', 'MiMo', 'llm', 'agent', 'coding', 'reasoning'],
    author: 'XpertAI Team',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register Xiaomi MiMo plugin');
    return { module: MimoModule, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('Xiaomi MiMo plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('Xiaomi MiMo plugin stopped');
  },
};

export default plugin;
