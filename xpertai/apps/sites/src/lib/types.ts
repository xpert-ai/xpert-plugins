export type SitesAccessMode = 'admins_only' | 'workspace_all' | 'custom' | 'public_link'
export type SitesProjectStatus = 'draft' | 'version_saved' | 'deployed' | 'archived'
export type SitesVersionStatus = 'saved' | 'build_failed'
export type SitesDeploymentStatus = 'pending' | 'deployed' | 'failed'
export type SitesStorageShape = 'static' | 'd1' | 'r2' | 'd1_r2' | 'workspace_auth' | 'external_auth'

export interface SitesScope {
  tenantId?: string
  organizationId?: string | null
  userId?: string
  assistantId?: string
  conversationId?: string
}

export interface SitesSourceFile {
  path: string
  content: string
  language?: string
  role?: 'entry' | 'style' | 'script' | 'asset' | 'config'
}

export interface SitesSandboxFileInfo {
  path: string
  is_dir?: boolean
  size?: number
  modified_at?: string
}

export interface SitesSandboxFileDownload {
  path: string
  content?: Uint8Array | ArrayBuffer | string | null
  error?: string | null
}

export interface SitesSandboxSourceReader {
  workingDirectory?: string
  globInfo(pattern: string, path?: string): Promise<SitesSandboxFileInfo[]> | SitesSandboxFileInfo[]
  downloadFiles(paths: string[]): Promise<SitesSandboxFileDownload[]> | SitesSandboxFileDownload[]
}

export interface SitesSourceReadOptions {
  sandboxBackend?: SitesSandboxSourceReader
  workingDirectory?: string
}

export interface SitesHostingConfig {
  project_id?: string
  d1?: string | null
  r2?: string | null
  auth?: 'none' | 'workspace' | 'external'
}

export interface CreateSitesProjectInput {
  name: string
  slug?: string
  description?: string
  audience?: SitesAccessMode
  customAudience?: string[]
  storageShape?: SitesStorageShape
  d1Binding?: string | null
  r2Binding?: string | null
  authMode?: 'none' | 'workspace' | 'external'
  sourcePath?: string
  prompt?: string
}

export interface SaveSitesVersionInput {
  projectId?: string
  slug?: string
  name?: string
  prompt?: string
  title?: string
  description?: string
  sourcePath?: string
  sourceCommit?: string
  storageShape?: SitesStorageShape
}

export interface DeploySitesVersionInput {
  projectId?: string
  versionId?: string
  accessMode?: SitesAccessMode
  customAudience?: string[]
  userConfirmedPublicLink?: boolean
}

export interface PublishSitesArtifactLinkInput {
  deploymentId: string
  expiresAt?: string | Date | null
  userConfirmedPublicLink: boolean
}

export interface RevokeSitesArtifactLinkInput {
  deploymentId: string
}

export interface SitesEnvironmentValueInput {
  projectId: string
  key: string
  value?: string
  secret?: boolean
  description?: string
}

export interface WorkbenchBrowserPreviewEvent {
  type: 'workbench.browser.preview'
  source?: string
  url: string
  displayUrl: string
  projectId?: string
  versionId?: string
  deploymentId?: string
  slug?: string
  versionNumber?: number
  status?: SitesDeploymentStatus
  accessMode?: SitesAccessMode
}

export interface SerializedSitesProject {
  id?: string
  name?: string
  slug?: string
  description?: string
  status?: SitesProjectStatus
  audience?: SitesAccessMode
  customAudience?: string[]
  storageShape?: SitesStorageShape
  sourcePath?: string
  hostingConfig?: SitesHostingConfig
  currentDeploymentId?: string
  currentDeploymentUrl?: string
  versionCount?: number
  deploymentCount?: number
  updatedAt?: Date
  createdAt?: Date
}
