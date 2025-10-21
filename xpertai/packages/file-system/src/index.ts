import { z } from 'zod';
import { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { FileSystemPlugin } from './lib/file-system.plugin.js';
import { svg } from './lib/types.js';

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
    category: 'doc-source',
    icon: { type: 'svg', value: svg },
    displayName: 'Document File System',
    description: 'Provide Remote and Local File System Document Source functionality',
    keywords: ['smb', 'sftp', 'ftp', 'webdav', 'document source'],
    author: 'XpertAI Team',
    homepage: 'https://xpertai.cloud',
  },
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register file system plugin');
    return { module: FileSystemPlugin, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('file system plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('file system plugin stopped');
  },
};

export default plugin;