import { DocxEditorMiddleware } from './docx-editor.middleware.js'
import { DOCX_EDITOR_FEATURE, DOCX_EDITOR_MIDDLEWARE_NAME, DOCX_EDITOR_TOOL_NAMES } from './constants.js'

describe('DocxEditorMiddleware', () => {
  it('exposes all DOCX Editor tools and feature metadata', () => {
    const middleware = new DocxEditorMiddleware({
      runAgentTool: jest.fn()
    } as never)

    const runtime = middleware.createMiddleware({}, {
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      userId: 'user-1',
      xpertId: 'xpert-1'
    })

    expect(middleware.meta.name).toBe(DOCX_EDITOR_MIDDLEWARE_NAME)
    expect(middleware.meta.features).toContain(DOCX_EDITOR_FEATURE)
    expect(runtime.name).toBe(DOCX_EDITOR_MIDDLEWARE_NAME)
    expect(runtime.tools?.map((item) => item.name)).toEqual([...DOCX_EDITOR_TOOL_NAMES])
  })
})
