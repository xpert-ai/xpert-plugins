import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { AgencyCatalogProvider, PLUGIN_NAME, PLUGIN_VERSION } from './catalog-provider'

@XpertServerPlugin({})
class AgencyAgentsModule {}

const templates = new AgencyCatalogProvider()
const roleSkills = z.array(z.object({
  type: z.literal('skill'), name: z.string(), displayName: z.string(),
  description: z.string(), tags: z.array(z.string())
})).parse(JSON.parse(readFileSync(join(__dirname, '..', 'dist/skill-catalog.json'), 'utf8')))
const plugin: XpertPlugin = {
  meta: {
    name: PLUGIN_NAME, version: PLUGIN_VERSION, level: 'organization', category: 'agent',
    displayName: { en_US: 'Agency Agents', zh_Hans: 'Agency 专家角色库' },
    description: { en_US: 'Create professional experts with ClawXpert middleware, skills and tools.', zh_Hans: '\u521b\u5efa\u4e13\u4e1a\u89d2\u8272\u4e13\u5bb6\uff0c\u9884\u914d ClawXpert \u4e2d\u95f4\u4ef6\u3001\u6280\u80fd\u4e0e\u5de5\u5177\u80fd\u529b\u3002' },
    author: 'XpertAI; Agency Agents contributors', targetApps: ['xpert'],
    targetAppMeta: {
      xpert: {
        types: ['assistant-template', 'skill'],
        marketplace: {
          contents: [...templates.listTemplates().map((entry) => ({
            type: 'assistant-template', name: entry.key, displayName: entry.title,
            description: entry.description, tags: [entry.category]
          })), ...roleSkills]
        }
      }
    }
  },
  config: { schema: z.object({}) },
  templates,
  register() { return { module: AgencyAgentsModule } }
}

export default plugin
