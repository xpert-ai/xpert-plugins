import { BadRequestException } from '@nestjs/common'
import { ContentResourcesRuntimeCapability, ProjectFilesRuntimeCapability, type ContentDocumentScope, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
/** Offline access is an explicit provider delegation. Project membership is checked
 * again by both the catalog and file APIs; an arbitrary cached path is never sufficient. */
export async function contentBackup(runtime: RuntimeCapabilityRegistry, scope: ContentDocumentScope, contentId: string) {
  const item = await runtime.require(ContentResourcesRuntimeCapability).catalog.get({ ...scope, contentId })
  if (item.offlineAccess !== 'project' || item.availability !== 'provider-unavailable') throw new BadRequestException('spaces.editor_unavailable')
  const files = runtime.require(ProjectFilesRuntimeCapability)
  let paths: string[]
  if (item.source.kind === 'file') paths = [item.source.path]
  else if (item.source.kind === 'bundle') {
    const root = item.source.rootPath
    paths = (await files.list({ actor: scope.actor, projectId: scope.projectId, path: root, depth: 16 })).filter(file => file.kind === 'file').map(file => file.path)
    if (paths.some(path => !path.startsWith(`${root}/`))) throw new BadRequestException('spaces.invalid_path')
  } else throw new BadRequestException('spaces.editor_unavailable')
  if (paths.length > 1000) throw new BadRequestException('spaces.file_too_large')
  const output: Array<{ path: string; sha256: string; contentBase64: string }> = []
  let total = 0
  for (const path of paths.sort()) {
    const file = await files.read({ actor: scope.actor, projectId: scope.projectId, path })
    total += file.buffer.length
    if (total > 20 * 1024 * 1024) throw new BadRequestException('spaces.file_too_large')
    output.push({ path, sha256: file.sha256, contentBase64: file.buffer.toString('base64') })
  }
  return { fileName: `${contentId}.source-backup.json`, content: JSON.stringify({ format: 'xpert.content.source-backup', schemaVersion: 1,
    contentId, resourceRef: item.resourceRef, model: { typeId: item.typeId, modelId: item.modelId, schemaVersion: item.schemaVersion },
    recordedRevision: item.revision, source: item.source, files: output }) }
}
