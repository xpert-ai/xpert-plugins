import { workspacePortableFileReferenceSchema } from './workspace-file-reference.js'

describe('workspacePortableFileReferenceSchema', () => {
  it('accepts nullable optional scope metadata from the host contract', () => {
    expect(
      workspacePortableFileReferenceSchema.parse({
        source: 'platform.workspace.files',
        tenantId: null,
        organizationId: null,
        userId: null,
        catalog: null,
        scopeId: null,
        projectId: null,
        knowledgeId: null,
        rootId: null,
        xpertId: null,
        isolateByUser: null,
        filePath: 'projects/example/input.mp4',
        workspacePath: '/workspace/input.mp4',
        originalName: null,
        name: null,
        mimeType: null,
        size: null
      })
    ).toMatchObject({
      source: 'platform.workspace.files',
      filePath: 'projects/example/input.mp4',
      workspacePath: '/workspace/input.mp4'
    })
  })
})
