import { storyStudioDebug } from './debug-logger'
import type { Candidate, ProductionView } from './production-data'
import {
  getErrorMessage,
  getResponsePayload,
  isRemoteObject,
  requestFileAccess,
  type RemoteValue
} from './runtime'

const MEDIA_ACCESS_CONCURRENCY = 4

export async function hydrateProductionMediaAccess(
  production: ProductionView | null,
  projectId: string | null | undefined
) {
  if (!production || !projectId) return production
  const candidates = [
    ...production.assets.flatMap((asset) => asset.candidates),
    ...production.scenes.flatMap((scene) =>
      scene.shots.flatMap((shot) => shot.candidates)
    )
  ].filter(needsMediaAccessRefresh)
  const urls = new Map<string, string>()
  await mapWithConcurrency(
    candidates,
    MEDIA_ACCESS_CONCURRENCY,
    async (candidate) => {
      try {
        const url = readMediaAccessUrl(
          getResponsePayload(await requestFileAccess(candidate.id, projectId))
        )
        if (url) urls.set(candidate.id, url)
      } catch (error) {
        storyStudioDebug.warn('media.file-access-failed', {
          candidateId: candidate.id,
          message: getErrorMessage(
            error instanceof Error ? error : String(error)
          )
        })
      }
    }
  )
  const hydrateCandidate = (candidate: Candidate) =>
    urls.has(candidate.id)
      ? { ...candidate, fileUrl: urls.get(candidate.id) ?? null }
      : candidate
  return {
    ...production,
    assets: production.assets.map((asset) => ({
      ...asset,
      candidates: asset.candidates.map(hydrateCandidate)
    })),
    scenes: production.scenes.map((scene) => ({
      ...scene,
      shots: scene.shots.map((shot) => ({
        ...shot,
        candidates: shot.candidates.map(hydrateCandidate)
      }))
    }))
  }
}

export function needsMediaAccessRefresh(
  candidate: Pick<Candidate, 'fileUrl' | 'workspacePath'>
) {
  return Boolean(
    candidate.workspacePath ||
      candidate.fileUrl?.includes('/api/workspace-files/content/')
  )
}

export function readMediaAccessUrl(value: RemoteValue): string | null {
  if (!isRemoteObject(value)) return null
  if (typeof value.url === 'string' && value.url.trim()) {
    return value.url.trim()
  }
  for (const key of ['payload', 'data', 'result']) {
    const nested = readMediaAccessUrl(value[key])
    if (nested) return nested
  }
  return null
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  operation: (item: T) => Promise<void>
) {
  let index = 0
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), items.length) },
    async () => {
      while (index < items.length) {
        const item = items[index]
        index += 1
        if (item) await operation(item)
      }
    }
  )
  await Promise.all(workers)
}
