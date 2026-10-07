import { emitResourceCard, isAgentInvocationTerminal, type AgentInvocation } from '@xpert-ai/plugin-sdk'
import type { ConversationResourceCard } from '@xpert-ai/contracts'
import type { RunnableConfig } from '@langchain/core/runnables'

/** Provider-neutral presentation. No URLs or navigation commands come from model output. */
export function taskResourceCards(task: AgentInvocation): ConversationResourceCard[] {
  if (!isAgentInvocationTerminal(task.status) || !task.result) return []
  const icons = { analysis: '📝', changes: '🛠️', tests: '🧪', file: '📄' }
  const cards: ConversationResourceCard[] = (task.result.items ?? [])
    .filter((item) => item.type !== 'file' && !task.activity)
    .map((item) => ({
      resource: { namespace: 'platform', type: `agent-task-${item.type}`, id: `${task.id}:${item.id}` },
      title: item.title,
      description: item.summary.slice(0, 240),
      icon: { type: 'emoji', value: icons[item.type] },
      open: {
        target: 'workbench.view',
        viewKey: 'platform.agent-results__results',
        selectionId: task.id,
        parameters: { itemId: item.id }
      }
    }))
  for (const artifact of task.result.artifacts ?? [])
    cards.push({
      resource: { namespace: 'platform', type: 'artifact', id: artifact.id, artifactId: artifact.id },
      title: artifact.name ?? artifact.id,
      icon: { type: 'emoji', value: '📄' },
      open: {
        target: 'workbench.view',
        viewKey: 'platform.agent-results__results',
        selectionId: task.id,
        parameters: { itemId: artifact.id }
      }
    })
  return cards
}

export async function emitTaskResults(task: AgentInvocation, config: RunnableConfig) {
  for (const card of taskResourceCards(task)) await emitResourceCard(card, config)
}
