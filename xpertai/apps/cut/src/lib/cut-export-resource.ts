import type { McpResourceTemplateDefinition } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import type { CutService } from './cut.service.js'

/** Completed artifacts remain accessible without a Workbench download action. */
export function cutExportResource(cut: Pick<CutService, 'resolveExportFile'>): McpResourceTemplateDefinition {
  return {
    key: 'cut_get_export',
    uriTemplate: 'cut://projects/{projectId}/exports/{exportId}',
    title: 'Read completed Cut export',
    description: 'Read a completed export and its authorized portable file reference. Download its filePath through the publication binary files endpoint.',
    mimeType: 'application/json',
    arguments: { projectId: { required: true }, exportId: { required: true } },
    requiredContext: ['tenant', 'principal', 'execution'],
    read: async (args, context) => {
      const { projectId, exportId } = z.object({ projectId: z.string().uuid(), exportId: z.string().uuid() }).strict().parse(args)
      const files = context.host.files
      if (!files) throw new Error('Workspace Files capability is required to retrieve a Cut export.')
      const result = await cut.resolveExportFile({
        tenantId: context.tenantId, organizationId: context.organizationId, userId: context.principal.userId,
        workspaceId: context.workspaceId, projectId: context.projectId, assistantId: context.xpertId,
        fileScope: files.scope
      }, projectId, exportId)
      await files.resolveFile(result.reference)
      return {
        contents: [{
          uri: context.resourceUri,
          mimeType: 'application/json',
          text: JSON.stringify({ projectId, exportId, ...result })
        }]
      }
    }
  }
}
