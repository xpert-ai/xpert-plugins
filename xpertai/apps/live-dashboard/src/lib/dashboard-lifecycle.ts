import { ServiceUnavailableException } from '@nestjs/common'
import type { ArtifactDraftsApi } from '@xpert-ai/plugin-sdk'

// The published SDK types predate this additive host API. Keep older hosts from creating more empty records.
type DraftLifecycleApi = ArtifactDraftsApi & { discardEmpty(input: { artifactId: string }): Promise<boolean> }

export function requireDraftLifecycle(api: ArtifactDraftsApi): DraftLifecycleApi {
  if (!('discardEmpty' in api) || typeof api.discardEmpty !== 'function')
    throw new ServiceUnavailableException('DASHBOARD_LIFECYCLE_UPGRADE_REQUIRED')
  return api as DraftLifecycleApi
}
