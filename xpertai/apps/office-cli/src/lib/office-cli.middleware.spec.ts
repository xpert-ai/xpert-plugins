import type { StructuredToolInterface } from '@langchain/core/tools'
import { SystemMessage } from '@langchain/core/messages'
import { OfficeCliMiddleware } from './office-cli.middleware'
import type { OfficeCliService } from './office-cli.service'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => (target: unknown) => target,
  XPERT_RUNTIME_CAPABILITIES_TOKEN: Symbol('XPERT_RUNTIME_CAPABILITIES_TOKEN'),
  pluginArtifactTableName: (namespace: string, key: string) => `${namespace}_${key}`,
  RequestContext: {
    getOrganizationId: () => null
  }
}))

describe('OfficeCliMiddleware', () => {
  it('exposes professional Office guidance and Word design tools', () => {
    const middleware = new OfficeCliMiddleware({} as OfficeCliService)
    const created = middleware.createMiddleware({}, {
      tenantId: 'tenant-1',
      userId: 'user-1'
    } as never) as {
      tools: StructuredToolInterface[]
    }

    expect(created.tools.map((item) => item.name)).toEqual(expect.arrayContaining([
      'officecli_load_skill',
      'officecli_apply_word_design'
    ]))
  })

  it('defaults document tools to the file selected in the workbench context', async () => {
    const documentId = '11111111-1111-4111-8111-111111111111'
    const service = {
      readDocument: jest.fn().mockResolvedValue({ documentId })
    } as unknown as OfficeCliService
    const middleware = new OfficeCliMiddleware(service)
    const created = middleware.createMiddleware({}, {
      tenantId: 'tenant-1',
      userId: 'user-1'
    } as never) as {
      tools: StructuredToolInterface[]
    }
    const readTool = created.tools.find((item) => item.name === 'officecli_read_document')

    expect(readTool).toBeDefined()
    await readTool!.invoke({}, {
      configurable: {
        context: {
          office_cli_workbench: {
            documentId,
            fileName: '当前文档.docx',
            format: 'docx',
            versionNumber: 1
          }
        }
      }
    })

    expect(service.readDocument).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', userId: 'user-1' }),
      documentId
    )
  })

  it('tells the model which Workbench document and element are selected', async () => {
    const middleware = new OfficeCliMiddleware({} as OfficeCliService)
    const created = middleware.createMiddleware({}, {
      tenantId: 'tenant-1',
      userId: 'user-1'
    } as never) as {
      wrapModelCall: (request: unknown, handler: (request: any) => unknown) => unknown
    }
    const handler = jest.fn((request) => request)

    created.wrapModelCall({
      systemMessage: new SystemMessage('Base instructions.'),
      runtime: {
        context: {
          office_cli_workbench: {
            documentId: '11111111-1111-4111-8111-111111111111',
            fileName: '当前文档.docx',
            format: 'docx',
            versionNumber: 3,
            elementPath: '/body/p[@paraId=ABC123]',
            selectedText: '需要修改的内容'
          }
        }
      }
    }, handler)

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      systemMessage: expect.objectContaining({
        content: expect.stringContaining('selectedElementPath: /body/p[@paraId=ABC123]')
      })
    }))
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      systemMessage: expect.objectContaining({
        content: expect.stringContaining('officecli_apply_word_design')
      })
    }))
  })
})
