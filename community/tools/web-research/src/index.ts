import { z } from 'zod';
import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { MyPlugin } from './lib/my-plugin';
import { PLUGIN_ARTIFACT_NAMESPACE, PLUGIN_LEVEL, PLUGIN_NAME, PLUGIN_VERSION, svg } from './lib/types';

const ConfigSchema = z.object({});

/**
 * @deprecated Compatibility assertion for plugin-sdk 3.6.x, whose PluginMeta
 * type omits the runtime-supported level and artifactNamespace fields.
 */
const pluginMeta = {
  name: PLUGIN_NAME,
  version: PLUGIN_VERSION,
  author: 'Xpert AI',
  level: PLUGIN_LEVEL,
  artifactNamespace: PLUGIN_ARTIFACT_NAMESPACE,
  category: 'tools',
  icon: {
    type: 'svg',
    value: svg
  },
  displayName: 'Web Research',
  description: 'Search and scrape public web pages with Firecrawl',
  keywords: ['web', 'search', 'scrape', 'firecrawl'],
} as XpertPlugin['meta'];

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: pluginMeta,
  config: {
    schema: ConfigSchema,
  },
  register(ctx) {
    ctx.logger.log('register web research plugin');
    return { module: MyPlugin, global: true };
  },
  async onStart(ctx) {
    ctx.logger.log('web research plugin started');
  },
  async onStop(ctx) {
    ctx.logger.log('web research plugin stopped');
  },
};

export default plugin;
