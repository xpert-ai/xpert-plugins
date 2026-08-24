import {
  isRemoteObject,
  type RemoteObject,
  type RemoteValue
} from './runtime'

export interface StoryToolEvent {
  toolName: string | null
  projectId: string | null
}

const TOOL_DESTINATION_STAGE: Record<string, number> = {
  story_upsert_production_episode: 4,
  story_upsert_production_character: 5,
  story_upsert_production_asset: 5,
  story_upsert_production_scene: 4,
  story_upsert_production_shot: 6
}

export function destinationStageForStoryTool(toolName: string | null) {
  return toolName ? TOOL_DESTINATION_STAGE[toolName] ?? null : null
}

export function normalizeStoryToolEvent(
  event: RemoteValue
): StoryToolEvent {
  const objects = collectObjects(event)
  return {
    toolName: firstString(objects, [
      'toolName',
      'tool',
      'name',
      'functionName'
    ]),
    projectId: firstString(objects, [
      'projectId',
      'storyProjectId'
    ])
  }
}

function collectObjects(value: RemoteValue) {
  const result: RemoteObject[] = []
  const pending: RemoteValue[] = [value]
  const seen = new Set<RemoteObject>()
  while (pending.length && result.length < 40) {
    const current = pending.shift()
    if (!isRemoteObject(current) || seen.has(current)) {
      continue
    }
    seen.add(current)
    result.push(current)
    for (const key of [
      'payload',
      'data',
      'result',
      'output',
      'receipt',
      'project',
      'input',
      'args',
      'target',
      'toolCall',
      'tool_call',
      'function',
      'content'
    ]) {
      const child = current[key]
      if (typeof child === 'string' && looksLikeJson(child)) {
        const parsed = parseJsonObject(child)
        if (parsed) {
          pending.push(parsed)
        }
      } else {
        pending.push(child)
      }
    }
  }
  return result
}

function firstString(objects: RemoteObject[], keys: string[]) {
  for (const object of objects) {
    for (const key of keys) {
      const value = object[key]
      if (typeof value === 'string' && value.trim()) {
        return value.trim()
      }
    }
  }
  return null
}

function looksLikeJson(value: string) {
  const trimmed = value.trim()
  return trimmed.startsWith('{') && trimmed.endsWith('}')
}

function parseJsonObject(value: string): RemoteObject | null {
  try {
    const parsed = JSON.parse(value)
    return isRemoteObject(parsed) ? parsed : null
  } catch {
    return null
  }
}
