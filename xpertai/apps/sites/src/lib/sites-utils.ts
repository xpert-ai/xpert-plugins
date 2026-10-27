import { createHash, randomUUID } from 'node:crypto'
import { BadRequestException } from '@nestjs/common'
import type { ArtifactLinkAccessInput } from '@xpert-ai/plugin-sdk'
import { SITES_PLUGIN_NAME, WORKBENCH_BROWSER_PREVIEW_EVENT_TYPE } from './constants.js'
import type { SitesAccessMode, WorkbenchBrowserPreviewEvent, CreateSitesProjectInput, SitesStorageShape, SitesHostingConfig, SerializedSitesProject } from './types.js'
type SitesDeploymentPreviewEventInput = {
  project?: { id?: string; slug?: string }
  version?: { id?: string; versionNumber?: number }
  deployment?: {
    id?: string
    projectId?: string
    versionId?: string
    deploymentUrl?: string
    status?: string
    accessMode?: string
  }
  url?: string
  displayUrl?: string
  deploymentUrl?: string
  projectId?: string
  versionId?: string
  deploymentId?: string
  slug?: string
  versionNumber?: number
  status?: string
  accessMode?: string
}

export function buildSitesDeploymentPreviewEvent(
  input: SitesDeploymentPreviewEventInput
): WorkbenchBrowserPreviewEvent | null {
  const url =
    optionalString(input.url) ??
    optionalString(input.displayUrl) ??
    optionalString(input.deploymentUrl) ??
    optionalString(input.deployment?.deploymentUrl)
  if (!url) {
    return null
  }

  const projectId = optionalString(input.projectId) ?? optionalString(input.deployment?.projectId) ?? optionalString(input.project?.id)
  const versionId = optionalString(input.versionId) ?? optionalString(input.deployment?.versionId) ?? optionalString(input.version?.id)
  const deploymentId = optionalString(input.deploymentId) ?? optionalString(input.deployment?.id)
  const slug = optionalString(input.slug) ?? optionalString(input.project?.slug)
  const versionNumber =
    typeof input.versionNumber === 'number'
      ? input.versionNumber
      : typeof input.version?.versionNumber === 'number'
        ? input.version.versionNumber
        : undefined
  const status = optionalString(input.status) ?? optionalString(input.deployment?.status)
  const accessMode = optionalString(input.accessMode) ?? optionalString(input.deployment?.accessMode)

  return {
    type: WORKBENCH_BROWSER_PREVIEW_EVENT_TYPE,
    source: SITES_PLUGIN_NAME,
    url,
    displayUrl: optionalString(input.displayUrl) ?? url,
    ...(projectId ? { projectId } : {}),
    ...(versionId ? { versionId } : {}),
    ...(deploymentId ? { deploymentId } : {}),
    ...(slug ? { slug } : {}),
    ...(versionNumber ? { versionNumber } : {}),
    ...(status ? { status: status as WorkbenchBrowserPreviewEvent['status'] } : {}),
    ...(accessMode ? { accessMode: accessMode as WorkbenchBrowserPreviewEvent['accessMode'] } : {})
  }
}

export function buildArtifactLinkAccess(
  accessMode?: SitesAccessMode,
  customAudience?: string[],
  userConfirmedPublicLink?: boolean,
  expiresAt?: string | Date | null
): ArtifactLinkAccessInput {
  return {
    mode: mapSitesArtifactAccessMode(accessMode),
    customPrincipals: accessMode === 'custom' ? normalizeStringArray(customAudience) : undefined,
    userConfirmedPublicLink: accessMode === 'public_link' ? userConfirmedPublicLink === true : undefined,
    expiresAt: normalizeArtifactLinkExpiresAt(expiresAt)
  }
}

export function artifactLinkPresentation() {
  return {
    disposition: 'inline' as const,
    allowDownload: false,
    safeHtmlProfile: 'interactive' as const
  }
}

export function mapSitesArtifactAccessMode(accessMode?: SitesAccessMode): ArtifactLinkAccessInput['mode'] {
  if (accessMode === 'workspace_all') return 'workspace_all'
  if (accessMode === 'custom') return 'custom_principals'
  if (accessMode === 'public_link') return 'public_link'
  return 'owner_only'
}

export function assertPublicLinkConfirmed(accessMode?: SitesAccessMode, userConfirmedPublicLink?: boolean) {
  if (accessMode === 'public_link' && userConfirmedPublicLink !== true) {
    throw new BadRequestException('Creating a public Artifact link requires explicit user confirmation')
  }
}

export function normalizeRequiredString(value: string | undefined, field: string) {
  const normalized = value?.trim()
  if (!normalized) {
    throw new BadRequestException(`${field} is required`)
  }
  return normalized
}

export function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function slugify(value: string) {
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || `site-${randomUUID().slice(0, 8)}`
}

export function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined
  }
  const items = value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
  return items.length ? Array.from(new Set(items)) : undefined
}

export function normalizeEnvironmentKey(value: string) {
  const key = value.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_')
  if (!key) {
    throw new BadRequestException('Environment key is required')
  }
  return key
}

export function normalizeArtifactLinkExpiresAt(value?: string | Date | null) {
  if (value === null || value === undefined) return null
  const expiresAt = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(expiresAt.getTime())) {
    throw new BadRequestException('expiresAt must be a valid date')
  }
  if (expiresAt.getTime() <= Date.now()) {
    throw new BadRequestException('expiresAt must be in the future')
  }
  return expiresAt
}

export function digest(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

export function inferStorageShape(input: CreateSitesProjectInput): SitesStorageShape {
  if (input.storageShape) return input.storageShape
  if (input.d1Binding && input.r2Binding) return 'd1_r2'
  if (input.d1Binding) return 'd1'
  if (input.r2Binding) return 'r2'
  if (input.authMode === 'workspace') return 'workspace_auth'
  if (input.authMode === 'external') return 'external_auth'
  return 'static'
}

export function buildHostingConfig(input: {
  projectId?: string
  storageShape: SitesStorageShape
  d1Binding?: string | null
  r2Binding?: string | null
  authMode?: 'none' | 'workspace' | 'external'
}): SitesHostingConfig {
  return {
    project_id: input.projectId,
    d1: input.d1Binding ?? (input.storageShape === 'd1' || input.storageShape === 'd1_r2' ? 'DB' : null),
    r2: input.r2Binding ?? (input.storageShape === 'r2' || input.storageShape === 'd1_r2' ? 'BUCKET' : null),
    auth: input.authMode ?? (input.storageShape === 'workspace_auth' ? 'workspace' : input.storageShape === 'external_auth' ? 'external' : 'none')
  }
}


export function summarizeProjects(projects: SerializedSitesProject[]) {
  return {
    total: projects.length,
    deployed: projects.filter((project) => project.status === 'deployed').length,
    saved: projects.filter((project) => project.status === 'version_saved').length,
    draft: projects.filter((project) => project.status === 'draft').length
  }
}
