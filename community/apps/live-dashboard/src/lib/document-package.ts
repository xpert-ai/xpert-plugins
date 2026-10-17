import { z } from 'zod/v3'
import { artifactDocumentDependencyAssets, verifyArtifactDocumentDependencies, type ArtifactDocumentDependencyAsset } from '@xpert-ai/plugin-sdk/artifact-document'
import { dashboardSchema, type DashboardManifest } from './dashboard.schema'

export const MAX_DASHBOARD_PACKAGE_BYTES = 9_000_000
const storedSchema = z.union([
  z.object({ schema: z.literal('xpert.live-dashboard.package/v1'), manifest: dashboardSchema, dependencies: artifactDocumentDependencyAssets }).strict(),
  dashboardSchema.transform(manifest => ({ manifest, dependencies: [] }))
])
/** Definition and exact library bytes share one immutable Artifact Version and content checksum. */
export function encodeDashboardPackage(manifest: DashboardManifest, dependencies: ArtifactDocumentDependencyAsset[]) {
  verifyArtifactDocumentDependencies(dependencies, manifest.presentation?.dependencies ?? [])
  return Buffer.from(JSON.stringify(dependencies.length ? { schema: 'xpert.live-dashboard.package/v1', manifest, dependencies } : manifest))
}
export function decodeDashboardPackage(bytes: Buffer) {
  if (bytes.byteLength > MAX_DASHBOARD_PACKAGE_BYTES) throw new Error('DASHBOARD_PACKAGE_TOO_LARGE')
  const stored = storedSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)))
  const dependencies = verifyArtifactDocumentDependencies(stored.dependencies, stored.manifest.presentation?.dependencies ?? [])
  return { manifest: stored.manifest, dependencies }
}
