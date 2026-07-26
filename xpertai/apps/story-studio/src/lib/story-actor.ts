import type { StoryScope } from './types.js'

export function storyActor(scope: StoryScope) {
  const actorType =
    scope.actorType ??
    (scope.assistantId ? 'agent' : scope.userId ? 'user' : 'system')
  const actorId =
    actorType === 'agent'
      ? scope.assistantId ?? scope.userId ?? null
      : actorType === 'user'
        ? scope.userId ?? null
        : null
  return { actorType, actorId }
}
