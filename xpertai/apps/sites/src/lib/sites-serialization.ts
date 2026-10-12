import { SitesProject, SitesVersion, SitesDeployment, SitesEnvironmentVariable } from './entities/index.js'
import type { SerializedSitesProject } from './types.js'
export function serializeProject(project: SitesProject, versionCount = 0, deploymentCount = 0): SerializedSitesProject {
  return {
    id: project.id,
    name: project.name,
    slug: project.slug,
    description: project.description,
    status: project.status,
    audience: project.audience,
    customAudience: project.customAudience,
    storageShape: project.storageShape,
    sourcePath: project.sourcePath,
    hostingConfig: project.hostingConfig,
    currentDeploymentId: project.currentDeploymentId,
    currentDeploymentUrl: project.currentDeploymentUrl,
    versionCount,
    deploymentCount,
    updatedAt: project.updatedAt,
    createdAt: project.createdAt
  }
}

export function serializeVersion(version: SitesVersion) {
  return {
    id: version.id,
    projectId: version.projectId,
    versionNumber: version.versionNumber,
    title: version.title,
    description: version.description,
    prompt: version.prompt,
    sourceCommit: version.sourceCommit,
    storageShape: version.storageShape,
    status: version.status,
    artifactDigest: version.artifactDigest,
    buildLogs: version.buildLogs,
    files: version.files?.map((file) => ({ ...file, contentPreview: file.content.slice(0, 240), contentLength: file.content.length, content: undefined })),
    createdAt: version.createdAt,
    updatedAt: version.updatedAt
  }
}

export function serializeDeployment(deployment: SitesDeployment) {
  return {
    id: deployment.id,
    projectId: deployment.projectId,
    versionId: deployment.versionId,
    deploymentUrl: deployment.deploymentUrl,
    artifactId: deployment.artifactId,
    artifactVersionId: deployment.artifactVersionId,
    artifactLinkId: deployment.artifactLinkId,
    status: deployment.status,
    accessMode: deployment.accessMode,
    customAudience: deployment.customAudience,
    environmentFingerprint: deployment.environmentFingerprint,
    deployedAt: deployment.deployedAt,
    errorMessage: deployment.errorMessage,
    createdAt: deployment.createdAt,
    updatedAt: deployment.updatedAt
  }
}

export function serializeEnvironmentValue(value: SitesEnvironmentVariable) {
  return {
    id: value.id,
    projectId: value.projectId,
    key: value.key,
    value: value.secret ? '********' : value.value,
    secret: value.secret,
    description: value.description,
    updatedAt: value.updatedAt,
    createdAt: value.createdAt
  }
}
