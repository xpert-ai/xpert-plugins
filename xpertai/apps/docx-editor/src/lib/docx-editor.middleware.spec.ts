import { AIMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
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

  it('allows documentId to be omitted from DOCX tool schemas', () => {
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

    const readDocumentTool = runtime.tools?.find((item) => item.name === 'docx_read_document')

    expect(readDocumentTool?.schema.safeParse({}).success).toBe(true)
  })

  it('supports single and batch docx_suggest_change inputs without allowing mixed forms', () => {
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

    const suggestChangeTool = runtime.tools?.find((item) => item.name === 'docx_suggest_change')

    expect(suggestChangeTool?.schema.safeParse({
      paraId: 'p1',
      search: 'old text',
      replaceWith: 'new text'
    }).success).toBe(true)
    expect(suggestChangeTool?.schema.safeParse({
      changes: [
        {
          paraId: 'p1',
          search: 'first paragraph text',
          replaceWith: 'first replacement'
        },
        {
          paraId: 'p2',
          search: 'second paragraph text',
          replaceWith: 'second replacement'
        }
      ]
    }).success).toBe(true)
    expect(suggestChangeTool?.schema.safeParse({
      paraId: 'p1',
      search: 'old text',
      replaceWith: 'new text',
      changes: [
        {
          paraId: 'p2',
          search: 'other text',
          replaceWith: 'other replacement'
        }
      ]
    }).success).toBe(false)
  })

  it('documents cross-paragraph and exact plain-text requirements for docx_suggest_change', () => {
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

    const suggestChangeTool = runtime.tools?.find((item) => item.name === 'docx_suggest_change')

    expect(suggestChangeTool?.description).toContain('changes[]')
    expect(suggestChangeTool?.description).toContain('exact paragraph plain text')
    expect(suggestChangeTool?.description).toContain('Visual indentation')
  })

  it('exposes review processing tools for comments and tracked changes', () => {
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

    const acceptChangeTool = runtime.tools?.find((item) => item.name === 'docx_accept_change')
    const acceptAllTool = runtime.tools?.find((item) => item.name === 'docx_accept_all_changes')
    const deleteAllCommentsTool = runtime.tools?.find((item) => item.name === 'docx_delete_all_comments')

    expect(acceptChangeTool?.schema.safeParse({ changeId: 5, noteId: 2, noteType: 'footnote' }).success).toBe(true)
    expect(acceptAllTool?.schema.safeParse({ includeFootnotes: true }).success).toBe(true)
    expect(deleteAllCommentsTool?.schema.safeParse({}).success).toBe(true)
    expect(acceptChangeTool?.description).toContain('noteId')
  })

  it('injects documentId from runtime structured context before DOCX tool execution', async () => {
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
    const handler = jest.fn(async () => new ToolMessage({ content: 'ok', tool_call_id: 'call-1' }))

    await runtime.wrapToolCall?.(
      {
        toolCall: {
          id: 'call-1',
          name: 'docx_read_document',
          args: {}
        },
        tool: runtime.tools?.[0] as never,
        state: { messages: [] },
        runtime: {
          context: {
            docxEditor: {
              currentDocument: {
                documentId: 'doc-1'
              }
            }
          }
        }
      } as never,
      handler as never
    )

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        toolCall: expect.objectContaining({
          args: {
            documentId: 'doc-1'
          }
        })
      })
    )
  })

  it('injects documentId from runtime env context before DOCX tool execution', async () => {
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
    const handler = jest.fn(async () => new ToolMessage({ content: 'ok', tool_call_id: 'call-1' }))

    await runtime.wrapToolCall?.(
      {
        toolCall: {
          id: 'call-1',
          name: 'docx_read_selection',
          args: {}
        },
        tool: runtime.tools?.[1] as never,
        state: { messages: [] },
        runtime: {
          context: {
            env: {
              docxEditorDocumentId: 'doc-from-env',
              docxEditorMode: 'suggesting'
            }
          }
        }
      } as never,
      handler as never
    )

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        toolCall: expect.objectContaining({
          args: {
            documentId: 'doc-from-env'
          }
        })
      })
    )
  })

  it('keeps an explicit documentId instead of replacing it with Workbench context', async () => {
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
    const handler = jest.fn(async () => new ToolMessage({ content: 'ok', tool_call_id: 'call-1' }))
    const request = {
      toolCall: {
        id: 'call-1',
        name: 'docx_read_document',
        args: {
          documentId: 'explicit-doc'
        }
      },
      tool: runtime.tools?.[0] as never,
      state: { messages: [] },
      runtime: {
        context: {
          docxEditor: {
            currentDocument: {
              documentId: 'workbench-doc'
            }
          }
        }
      }
    } as never

    await runtime.wrapToolCall?.(request, handler as never)

    expect(handler).toHaveBeenCalledWith(request)
  })

  it('injects documentId from configurable runtime context before DOCX tool execution', async () => {
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
    const handler = jest.fn(async () => new ToolMessage({ content: 'ok', tool_call_id: 'call-1' }))

    await runtime.wrapToolCall?.(
      {
        toolCall: {
          id: 'call-1',
          name: 'docx_read_document',
          args: {}
        },
        tool: runtime.tools?.[0] as never,
        state: { messages: [] },
        runtime: {
          configurable: {
            context: {
              docxEditor: {
                currentDocument: {
                  documentId: 'doc-from-configurable'
                }
              }
            }
          }
        }
      } as never,
      handler as never
    )

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        toolCall: expect.objectContaining({
          args: {
            documentId: 'doc-from-configurable'
          }
        })
      })
    )
  })

  it('returns a clear error when documentId and current Workbench context are missing', async () => {
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
    const handler = jest.fn()

    const result = await runtime.wrapToolCall?.(
      {
        toolCall: {
          id: 'call-1',
          name: 'docx_read_selection',
          args: {}
        },
        tool: runtime.tools?.[1] as never,
        state: { messages: [] },
        runtime: {
          context: {}
        }
      } as never,
      handler as never
    )

    expect(handler).not.toHaveBeenCalled()
    expect(result).toBeInstanceOf(ToolMessage)
    expect((result as ToolMessage).content).toBe('未找到当前 Workbench 文档，请先打开文档或显式传 documentId。')
  })

  it('injects current Workbench document context into model calls', async () => {
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
    const handler = jest.fn(async () => new AIMessage('ok'))

    await runtime.wrapModelCall?.(
      {
        systemMessage: new SystemMessage('Base prompt.'),
        messages: [],
        tools: [],
        state: { messages: [] },
        runtime: {
          context: {
            docxEditor: {
              currentDocument: {
                documentId: 'doc-1',
                title: 'Document 1',
                currentVersionNumber: 2,
                workspaceFilePath: 'files/docx-editor/documents/doc-1/versions/v2-abcd1234.docx',
                dirty: true,
                mode: 'suggesting'
              }
            }
          }
        }
      } as never,
      handler as never
    )

    const request = handler.mock.calls[0]?.[0]
    expect(request.systemMessage.content).toContain('Base prompt.')
    expect(request.systemMessage.content).toContain('documentId: doc-1')
    expect(request.systemMessage.content).toContain('title: Document 1')
    expect(request.systemMessage.content).toContain('currentVersionNumber: 2')
    expect(request.systemMessage.content).toContain('dirty: true')
    expect(request.systemMessage.content).toContain('mode: suggesting')
    expect(request.systemMessage.content).toContain('Prefer docx_suggest_change')
  })

  it('injects current Workbench mode from env context into model calls', async () => {
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
    const handler = jest.fn(async () => new AIMessage('ok'))

    await runtime.wrapModelCall?.(
      {
        systemMessage: 'Base prompt.',
        messages: [],
        tools: [],
        state: { messages: [] },
        runtime: {
          context: {
            env: {
              docxEditorDocumentId: 'doc-1',
              docxEditorMode: 'viewing'
            }
          }
        }
      } as never,
      handler as never
    )

    const request = handler.mock.calls[0]?.[0]
    expect(request.systemMessage.content).toContain('mode: viewing')
    expect(request.systemMessage.content).toContain('Treat the document as read-only')
  })
})
