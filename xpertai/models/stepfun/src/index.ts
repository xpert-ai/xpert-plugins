import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { StepfunModule } from './stepfun.module.js';

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
    displayName: 'StepFun',
    description: 'Provide StepFun language and multimodal models',
    keywords: ['StepFun', 'llm', 'multimodal', 'vision', 'video', 'reasoning'],
    author: 'XpertAI Team',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register StepFun plugin');
    return { module: StepfunModule, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('StepFun plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('StepFun plugin stopped');
  },
};

export default plugin;
