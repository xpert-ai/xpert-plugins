import { createHash } from 'node:crypto'
import type { TAvatar } from '@xpert-ai/contracts'
import { roleRuntime } from './role-runtime'

/** Role examples are literal text; restore Mustache delimiters for the host's following instructions. */
export function literalRolePrompt(body: string): string {
  let sequence = 0
  while (body.includes(`[[ROLE${sequence}`) || body.includes(`ROLE${sequence}]]`)) sequence++
  const open = `[[ROLE${sequence}`
  const close = `ROLE${sequence}]]`
  // The host decodes these two HTML entities before Mustache; reconstruct literals afterwards.
  const literalBody = body.replace(/&(lt|gt);/g, `&${open}!${close}$1;`)
  return `{{=${open} ${close}=}}\n${literalBody}\n${open}={{ }}=${close}`
}

export function roleAgentKey(id: string): string {
  return `Agent_${createHash('sha256').update(id).digest('hex').slice(0, 16)}`
}

export function roleTemplate(input: {
  id: string; title: string; description: string; body: string; pluginName: string;
  locale: string; pluginVersion: string; contentHash: string; avatar: TAvatar; skillKey: string
}) {
  const agentKey = roleAgentKey(input.id)
  const runtime = roleRuntime(agentKey)
  const agent = {
    key: agentKey, name: `agency-${createHash('sha256').update(input.id).digest('hex').slice(0, 16)}`,
    title: input.title, description: input.description, prompt: literalRolePrompt([
      `You are ${input.title}. ${input.description}`,
      `Before doing role-specific work, read the installed skill "${input.skillKey}" and follow its guidance.`,
      'That skill contains your role instructions, methods, constraints, and deliverable formats.',
      "Respond in the user's language unless they request otherwise."
    ].join('\n')), avatar: input.avatar,
    toolsetIds: [], knowledgebaseIds: [], collaboratorNames: [], options: runtime.agentOptions
  }
  return {
    team: {
      name: agent.name, title: input.title, description: input.description, type: 'agent', avatar: input.avatar, agent,
      features: runtime.features, agentConfig: runtime.agentConfig,
      options: {
        templateSource: {
          templateId: `${input.pluginName}:${input.id}`, templateKey: input.id,
          pluginName: input.pluginName, source: 'plugin', locale: input.locale,
          pluginVersion: input.pluginVersion, contentHash: input.contentHash
        }
      }
    },
    nodes: [{ type: 'agent', key: agentKey, position: { x: 0, y: 0 }, entity: agent }, ...runtime.nodes],
    connections: runtime.connections
  }
}
