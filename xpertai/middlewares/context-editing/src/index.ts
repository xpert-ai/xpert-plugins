import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ContextEditingPlugin } from './lib/context-editing.module.js';

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
      value: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect x="4" y="4" width="56" height="56" rx="8" ry="8" fill="#4c4180"/>
  
  <rect x="9.5" y="11" width="17" height="17" rx="2" ry="2" fill="#93d9f8"/>
  
  <rect x="9.5" y="33" width="17" height="4" rx="2" ry="2" fill="#d6e0f0"/>
  <rect x="9.5" y="41" width="13" height="4" rx="2" ry="2" fill="#d6e0f0"/>
  
  <rect x="33" y="11" width="23" height="4" rx="2" ry="2" fill="#d6e0f0"/>
  <rect x="46" y="19" width="10" height="4" rx="2" ry="2" fill="#d6e0f0"/>
  <rect x="46" y="27" width="10" height="4" rx="2" ry="2" fill="#d6e0f0"/>
  
  <path d="M38.1,24.2c-2.1,0-3.9,1.8-3.9,3.9v13.7c-1.1-1.3-2.7-2.1-4.4-2.1c-3.2,0-5.8,2.6-5.8,5.8l0,4c0,8.1,6.6,14.7,14.7,14.7h10.6c8.1,0,14.7-6.6,14.7-14.7l0-4c0-3.2-2.6-5.8-5.8-5.8c-0.7,0-1.4,0.1-2,0.4v-1.1c0-2.1-1.8-3.9-3.9-3.9s-3.9,1.8-3.9,3.9v-2c0-2.1-1.8-3.9-3.9-3.9s-3.9,1.8-3.9,3.9v-13C42,26,40.2,24.2,38.1,24.2z" fill="#fec0b4"/>
  <path d="M38.1,24.2v20.4L36.4,42c-0.9-1.1-2.3-1.8-3.9-1.8c-2.8,0-5.1,2.3-5.1,5.1l0,4c0,7.1,5.8,12.9,12.9,12.9h8.6l0-31.3C48.3,30.6,46.7,32.2,44.6,32.2v4.6c0,2.8-2.3,5.1-5.1,5.1s-5.1-2.3-5.1-5.1v-13C34.2,24.2,36,26,38.1,24.2z" fill="#ffab9e"/>
</svg>`,
    },
    displayName: 'Context Editing Middleware',
    description: 'A middleware that automatically prunes tool results to manage context size. This middleware applies a sequence of edits when the total input token count exceeds configured thresholds.',
    keywords: ['context', 'editing', 'middleware'],
    author: 'XpertAI Team',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register context editing middleware plugin');
    return { module: ContextEditingPlugin, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('context editing middleware plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('context editing middleware plugin stopped');
  },
};

export default plugin;