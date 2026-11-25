import type { ArtifactDocumentHostOptions } from '@xpert-ai/plugin-sdk/artifact-document'

export const DASHBOARD_DOWNLOAD_POLICY = Object.freeze({
  allowDownloads: true
} satisfies Pick<ArtifactDocumentHostOptions<unknown>, 'allowDownloads'>)

export const DASHBOARD_FRAME_SANDBOX = DASHBOARD_DOWNLOAD_POLICY.allowDownloads ? 'allow-scripts allow-downloads' : 'allow-scripts'
