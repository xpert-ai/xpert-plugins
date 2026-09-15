import type { ResourceReadContext, WorkspaceFilesApi } from '@xpert-ai/plugin-sdk'
import { cutExportResource } from './cut-export-resource.js'

const projectId = '11111111-1111-4111-8111-111111111111'
const exportId = '22222222-2222-4222-8222-222222222222'

describe('Cut standalone export resource', () => {
  const scope = { tenantId: 'tenant', userId: 'alice', catalog: 'users' as const, scopeId: 'alice' }
  const reference = { ...scope, source: 'platform.workspace.files' as const, filePath: 'files/cut/video.mp4' }
  const resolveFile = jest.fn()
  const resolveExportFile = jest.fn()
  const files: WorkspaceFilesApi = {
    scope, resolveFile, uploadBuffer: jest.fn(), understandFile: jest.fn(), getUnderstandingStatus: jest.fn(),
    retryUnderstanding: jest.fn(), validateUnderstandingReferences: jest.fn(), listUnderstandingChunks: jest.fn(),
    searchUnderstandingChunks: jest.fn(), readBuffer: jest.fn(), deleteFile: jest.fn(),
    resolveRuntimeReference: jest.fn(), readRuntimeBuffer: jest.fn(), writeRuntimeBuffer: jest.fn()
  }
  const context: ResourceReadContext = {
    source: 'mcp', tenantId: 'tenant', principal: { type: 'user', id: 'alice', userId: 'alice' },
    executionId: 'execution', requestId: 'request', resourceUri: `cut://projects/${projectId}/exports/${exportId}`, host: { files }
  }
  beforeEach(() => {
    jest.clearAllMocks()
    resolveFile.mockResolvedValue({ size: 10 })
    resolveExportFile.mockResolvedValue({ reference, filename: 'video.mp4', mimeType: 'video/mp4', size: 10 })
  })
  it('returns metadata only after authorizing the persisted artifact reference', async () => {
    const result = await cutExportResource({ resolveExportFile }).read({ projectId, exportId }, context)
    expect(resolveExportFile).toHaveBeenCalledWith(expect.objectContaining({ userId: 'alice', fileScope: scope }), projectId, exportId)
    expect(resolveFile).toHaveBeenCalledWith(reference)
    expect(JSON.parse(result.contents[0]!.text!)).toMatchObject({ projectId, exportId, reference })
    expect(result.contents[0]).not.toHaveProperty('blob')
    expect(result.contents[0]!.uri).toBe(context.resourceUri)
  })
  it('does not expose an export reference that the current file binding rejects', async () => {
    resolveFile.mockRejectedValueOnce(new Error('Foreign user'))
    await expect(cutExportResource({ resolveExportFile }).read({ projectId, exportId }, context)).rejects.toThrow('Foreign user')
  })
})
