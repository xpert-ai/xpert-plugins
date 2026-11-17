import { ForbiddenException } from '@nestjs/common'
import { ArtifactTypeProvider, type IArtifactTypeProvider, type ArtifactTypeDefinition, type ArtifactTypeSource, type ArtifactTypeActor } from '@xpert-ai/plugin-sdk'
import { PLUGIN_NAME } from '../dashboard.service'
import { LIBRARY_FILE_TYPE, assetSchema, limits } from './resource-contract'
import { validateAssetContent } from './asset-validation'

/** @beta Files are private until a supported public-copy authorization path is available. */
@ArtifactTypeProvider(LIBRARY_FILE_TYPE)
export class LibraryFileArtifactType implements IArtifactTypeProvider {
  readonly definition: ArtifactTypeDefinition = {
    title: { en_US: 'Dashboard library attachment', zh_Hans: '看板资源库附件' }, kinds: ['file'],
    content: { mimeTypes: assetSchema.shape.mimeType.options, maxBytes: limits.assetBytes }, collection: { allowCopy: true },
    sharing: { accessModes: ['owner_only'], versionModes: ['version'], allowDownload: true, mutableLinks: false, descriptor: false },
    presentation: { mode: 'file' }
  }
  async authorize(source: ArtifactTypeSource, actor: ArtifactTypeActor) {
    if (source.pluginName !== PLUGIN_NAME || source.resourceType !== LIBRARY_FILE_TYPE || !actor.userId || !actor.tenantId ||
      source.userId !== actor.userId || source.tenantId !== actor.tenantId) throw new ForbiddenException('LIBRARY_ASSET_DENIED')
  }
  validateContent(bytes: Buffer, mimeType: string) { validateAssetContent(bytes, assetSchema.shape.mimeType.parse(mimeType)) }
}
