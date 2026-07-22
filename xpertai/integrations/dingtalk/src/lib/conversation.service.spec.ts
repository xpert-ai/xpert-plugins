jest.mock('@xpert-ai/plugin-sdk', () => ({
  CHAT_CHANNEL_TEXT_LIMITS: { dingtalk: 3000 },
  ChatChannel: () => () => undefined,
  INTEGRATION_PERMISSION_SERVICE_TOKEN: 'INTEGRATION_PERMISSION_SERVICE_TOKEN',
  RequestContext: {
    currentUser: jest.fn(() => ({})),
    currentUserId: jest.fn(() => null),
    currentTenantId: jest.fn(() => null),
    getOrganizationId: jest.fn(() => null)
  },
  runWithRequestContext: jest.fn((_user: unknown, fn: () => unknown) => fn()),
  WorkspaceFilesRuntimeCapability: Symbol.for('WorkspaceFilesRuntimeCapability'),
  XPERT_RUNTIME_CAPABILITIES_TOKEN: 'XPERT_RUNTIME_CAPABILITIES_TOKEN'
}))

jest.mock('./workflow/dingtalk-trigger.strategy.js', () => ({
  DingTalkTriggerStrategy: class DingTalkTriggerStrategy {}
}))

jest.mock('./message.js', () => ({
  ChatDingTalkMessage: class ChatDingTalkMessage {
    constructor(
      public readonly chatContext: unknown,
      public readonly options: unknown
    ) {}
  }
}))

import { DingTalkConversationService } from './conversation.service.js'

describe('DingTalkConversationService', () => {
  function createService() {
    const commandBus = {
      execute: jest.fn().mockResolvedValue({})
    }
    const cacheManager = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined)
    }
	    const dingtalkClient = {
	      downloadMessageFile: jest.fn().mockResolvedValue({
	        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x61, 0x62, 0x63]),
	        mimeType: 'image/png',
	        fileName: 'photo.png'
	      })
	    }
	    const dingtalkChannel = {
	      errorMessage: jest.fn().mockResolvedValue(undefined),
	      getOrCreateDingTalkClientById: jest.fn().mockResolvedValue(dingtalkClient)
	    }
    const workspaceFiles = {
      uploadBuffer: jest.fn().mockResolvedValue({
        filePath: 'files/dingtalk/integration-1/hash/report.pdf',
        workspacePath: '/workspace/files/dingtalk/integration-1/hash/report.pdf',
        fileUrl: 'workspace://files/dingtalk/integration-1/hash/report.pdf',
        mimeType: 'application/pdf',
        size: 11
      }),
      understandFile: jest.fn().mockResolvedValue({
        fileAssetId: 'file-asset-1',
        fileId: 'file-1',
        filePath: 'files/dingtalk/integration-1/hash/report.pdf',
        workspacePath: '/workspace/files/dingtalk/integration-1/hash/report.pdf',
        fileUrl: 'workspace://files/dingtalk/integration-1/hash/report.pdf',
        originalName: 'report.pdf',
        mimeType: 'application/pdf',
        size: 11
      })
    }
    const runtimeCapabilities = {
      get: jest.fn((key: unknown) =>
        key === Symbol.for('WorkspaceFilesRuntimeCapability') ? workspaceFiles : undefined
      )
    }
    const conversationBindingRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue({ affected: 0 })
    }
    const triggerBindingRepository = {
      findOne: jest.fn().mockResolvedValue(null)
    }
    const integrationPermissionService = {
      read: jest.fn().mockResolvedValue({
        id: 'integration-1',
        options: {
          xpertId: 'fallback-xpert',
          preferLanguage: 'zh-Hans'
        },
        tenant: null,
        organizationId: 'org-1'
      })
    }
    const triggerStrategy = {
      handleInboundMessage: jest.fn().mockResolvedValue(false)
    }
    const pluginContext = {
      resolve: jest.fn((token: unknown) => {
        if (token === 'INTEGRATION_PERMISSION_SERVICE_TOKEN') {
          return integrationPermissionService
        }
        throw new Error(`Unexpected token: ${String(token)}`)
      })
    }

    const service = new DingTalkConversationService(
      commandBus as any,
      cacheManager as any,
      dingtalkChannel as any,
      conversationBindingRepository as any,
      triggerBindingRepository as any,
      triggerStrategy as any,
      pluginContext as any,
      runtimeCapabilities as any
    )

    return {
      service,
      commandBus,
	      dingtalkChannel,
	      dingtalkClient,
      workspaceFiles,
	      conversationBindingRepository,
      triggerBindingRepository,
      triggerStrategy,
      pluginContext
    }
  }

  it('does not dispatch through integration xpertId when trigger binding is missing', async () => {
    const { service, commandBus, dingtalkChannel, triggerStrategy } = createService()

    await service.processMessage({
      integrationId: 'integration-1',
      input: 'hello',
      senderOpenId: 'sender-open-id',
      chatId: 'chat-1',
      userId: 'user-1'
    } as any)

    expect(commandBus.execute).not.toHaveBeenCalled()
    expect(triggerStrategy.handleInboundMessage).not.toHaveBeenCalled()
    expect(dingtalkChannel.errorMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationId: 'integration-1',
        chatId: 'chat-1'
      }),
      expect.objectContaining({
        message: expect.stringContaining('trigger')
      })
    )
  })

  it('uses the injected trigger strategy for bound integrations', async () => {
    const { service, dingtalkChannel, triggerBindingRepository, triggerStrategy, pluginContext } = createService()
    triggerBindingRepository.findOne.mockResolvedValueOnce({ xpertId: 'xpert-1' })
    triggerStrategy.handleInboundMessage.mockResolvedValueOnce(true)

    await service.processMessage({
      integrationId: 'integration-1',
      input: 'hello',
      senderOpenId: 'sender-open-id',
      chatId: 'chat-1',
      chatType: 'private',
      message: {
        senderStaffId: 'sender-staff-id'
      },
      userId: 'user-1'
    } as any)

    expect(pluginContext.resolve).not.toHaveBeenCalledWith(expect.any(Function))
    expect(triggerStrategy.handleInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationId: 'integration-1',
        input: 'hello'
      })
    )
    expect(dingtalkChannel.errorMessage).not.toHaveBeenCalled()

    const dingtalkMessage = triggerStrategy.handleInboundMessage.mock.calls[0][0].dingtalkMessage
    expect(dingtalkMessage.chatContext.chatType).toBe('private')
    expect(dingtalkMessage.chatContext.senderRecipient).toEqual({ type: 'user_id', id: 'sender-staff-id' })
  })

  it('persists explicit callback context when conversation starts outside request context', async () => {
    const { service, conversationBindingRepository } = createService()
    const createdById = '11111111-1111-4111-8111-111111111111'

    await service.setConversation('integration-1:chat-1:user-1', 'xpert-1', 'conversation-1', new Date(0), {
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      createdById
    })

    expect(conversationBindingRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
        conversationUserKey: 'integration-1:chat-1:user-1',
        xpertId: 'xpert-1',
        conversationId: 'conversation-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        createdById,
        updatedById: createdById
      }),
      ['conversationUserKey', 'xpertId']
    )
  })

  it('falls back to trigger binding context when conversation binding has no execution context', async () => {
    const { service, conversationBindingRepository, triggerBindingRepository } = createService()
    const createdById = '11111111-1111-4111-8111-111111111111'

    conversationBindingRepository.findOne.mockResolvedValueOnce({
      conversationUserKey: 'integration-1:chat-1:user-1',
      xpertId: 'xpert-1',
      tenantId: null,
      organizationId: null,
      createdById: null
    })
    conversationBindingRepository.findOne.mockResolvedValueOnce(null)
    triggerBindingRepository.findOne.mockResolvedValueOnce({
      xpertId: 'xpert-1',
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      createdById
    })

    await expect(service.resolveDispatchExecutionContext('xpert-1', 'integration-1:chat-1:user-1')).resolves.toEqual({
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      createdById,
      source: 'trigger-binding'
    })
  })

	  it('uses instance-scoped Bull queue names so stale plugin workers cannot consume new messages', () => {
	    const first = createService().service as any
	    const second = createService().service as any

	    expect(first.getUserQueueName('integration-1:user-1')).toContain('dingtalk:user:')
	    expect(first.getUserQueueName('integration-1:user-1')).toContain('integration-1:user-1')
	    expect(first.getUserQueueName('integration-1:user-1')).not.toBe(second.getUserQueueName('integration-1:user-1'))
	  })

	  it('forwards inbound image messages as vision files', async () => {
	    const { service, commandBus, conversationBindingRepository, dingtalkClient, dingtalkChannel, triggerBindingRepository, triggerStrategy } =
	      createService()
	    triggerBindingRepository.findOne.mockResolvedValueOnce({ xpertId: 'xpert-1' })
	    conversationBindingRepository.findOne.mockResolvedValueOnce({
	      conversationUserKey: 'integration-1:chat-1:sender-open-id',
	      xpertId: 'xpert-1',
	      conversationId: 'conversation-1',
	      updatedAt: new Date()
	    })
	    triggerStrategy.handleInboundMessage.mockResolvedValueOnce(false)

	    await service.processMessage({
	      integrationId: 'integration-1',
	      senderOpenId: 'sender-open-id',
	      chatId: 'chat-1',
	      userId: 'user-1',
	      message: {
	        eventId: 'msg-1',
	        conversationId: 'chat-1',
	        senderId: 'sender-open-id',
	        msgType: 'image',
	        content: JSON.stringify({
	          downloadCode: 'download-code-1',
	          fileName: 'photo.png'
	        })
	      }
	    } as any)

	    expect(dingtalkChannel.getOrCreateDingTalkClientById).toHaveBeenCalledWith('integration-1')
	    expect(dingtalkClient.downloadMessageFile).toHaveBeenCalledWith({
	      downloadCode: 'download-code-1',
	      robotCode: undefined
	    })
	    expect(commandBus.execute).toHaveBeenCalledWith(
	      expect.objectContaining({
	        input: expect.objectContaining({
	          xpertId: 'xpert-1',
	          input: '',
	          files: [
	            {
	              fileUrl: `data:image/png;base64,${Buffer.from([
	                0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x61, 0x62, 0x63
	              ]).toString('base64')}`,
	              mimeType: 'image/png',
	              originalName: 'photo.png',
	              fileKey: 'download-code-1'
	            }
	          ]
	        })
	      })
	    )
	  })

  it('stores inbound DingTalk files in the Xpert workspace before dispatch', async () => {
    const {
      service,
      commandBus,
      conversationBindingRepository,
      dingtalkClient,
      workspaceFiles,
      triggerBindingRepository,
      triggerStrategy
    } = createService()
    const fileBuffer = Buffer.from('%PDF-report')
    dingtalkClient.downloadMessageFile.mockResolvedValueOnce({
      buffer: fileBuffer,
      mimeType: 'application/pdf',
      fileName: 'report.pdf'
    })
    triggerBindingRepository.findOne.mockResolvedValueOnce({ xpertId: 'xpert-1' })
    conversationBindingRepository.findOne.mockResolvedValueOnce({
      conversationUserKey: 'integration-1:chat-1:sender-open-id',
      xpertId: 'xpert-1',
      conversationId: 'conversation-1',
      updatedAt: new Date()
    })
    triggerStrategy.handleInboundMessage.mockResolvedValueOnce(false)

    await service.processMessage({
      integrationId: 'integration-1',
      senderOpenId: 'sender-open-id',
      chatId: 'chat-1',
      userId: 'user-1',
      message: {
        eventId: 'msg-file-1',
        conversationId: 'chat-1',
        senderId: 'sender-open-id',
        msgType: 'file',
        content: {
          downloadCode: 'download-code-file-1',
          fileName: 'report.pdf'
        }
      }
    } as any)

    expect(dingtalkClient.downloadMessageFile).toHaveBeenCalledWith({
      downloadCode: 'download-code-file-1',
      robotCode: undefined
    })
    expect(workspaceFiles.uploadBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        catalog: 'xperts',
        xpertId: 'xpert-1',
        isolateByUser: false,
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
        buffer: fileBuffer
      })
    )
    expect(workspaceFiles.understandFile).toHaveBeenCalledWith(
      expect.objectContaining({
        catalog: 'xperts',
        xpertId: 'xpert-1',
        purpose: 'chat_attachment',
        conversationId: 'conversation-1'
      })
    )
    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          xpertId: 'xpert-1',
          input: '',
          files: [
            expect.objectContaining({
              fileAssetId: 'file-asset-1',
              fileId: 'file-1',
              workspacePath: '/workspace/files/dingtalk/integration-1/hash/report.pdf',
              originalName: 'report.pdf',
              mimeType: 'application/pdf'
            })
          ]
        })
      })
    )
    const dispatchedFile = (commandBus.execute.mock.calls[0][0] as any).input.files[0]
    expect(dispatchedFile.fileUrl).not.toMatch(/^data:/)
  })

  it('forwards DingTalk picture messages as vision files', async () => {
    const { service, commandBus, conversationBindingRepository, dingtalkClient, dingtalkChannel, triggerBindingRepository, triggerStrategy } =
      createService()
    triggerBindingRepository.findOne.mockResolvedValueOnce({ xpertId: 'xpert-1' })
    conversationBindingRepository.findOne.mockResolvedValueOnce({
      conversationUserKey: 'integration-1:chat-1:sender-open-id',
      xpertId: 'xpert-1',
      conversationId: 'conversation-1',
      updatedAt: new Date()
    })
    triggerStrategy.handleInboundMessage.mockResolvedValueOnce(false)

    await service.processMessage({
      integrationId: 'integration-1',
      senderOpenId: 'sender-open-id',
      chatId: 'chat-1',
      userId: 'user-1',
      message: {
        eventId: 'msg-1',
        conversationId: 'chat-1',
        senderId: 'sender-open-id',
        msgtype: 'picture',
        robotCode: 'robot-code-1',
        content: {
          downloadCode: 'download-code-1',
          pictureDownloadCode: 'picture-download-code-1'
        }
      }
    } as any)

    expect(dingtalkChannel.getOrCreateDingTalkClientById).toHaveBeenCalledWith('integration-1')
    expect(dingtalkClient.downloadMessageFile).toHaveBeenCalledWith({
      downloadCode: 'download-code-1',
      robotCode: 'robot-code-1'
    })
    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          xpertId: 'xpert-1',
          input: '',
          files: [
            expect.objectContaining({
              mimeType: 'image/png',
              originalName: 'photo.png',
              fileKey: 'download-code-1'
            })
          ]
        })
      })
    )
  })

  it('keeps text and image from DingTalk richText messages', async () => {
    const { service, commandBus, conversationBindingRepository, dingtalkClient, dingtalkChannel, triggerBindingRepository, triggerStrategy } =
      createService()
    triggerBindingRepository.findOne.mockResolvedValueOnce({ xpertId: 'xpert-1' })
    conversationBindingRepository.findOne.mockResolvedValueOnce({
      conversationUserKey: 'integration-1:chat-1:sender-open-id',
      xpertId: 'xpert-1',
      conversationId: 'conversation-1',
      updatedAt: new Date()
    })
    triggerStrategy.handleInboundMessage.mockResolvedValueOnce(false)

    await service.processMessage({
      integrationId: 'integration-1',
      senderOpenId: 'sender-open-id',
      chatId: 'chat-1',
      userId: 'user-1',
      message: {
        eventId: 'msg-1',
        conversationId: 'chat-1',
        senderId: 'sender-open-id',
        msgtype: 'richText',
        robotCode: 'robot-code-1',
        content: {
          richText: [
            {
              text: '看这个图片'
            },
            {
              type: 'picture',
              downloadCode: 'download-code-1',
              pictureDownloadCode: 'picture-download-code-1'
            }
          ]
        }
      }
    } as any)

    expect(dingtalkChannel.getOrCreateDingTalkClientById).toHaveBeenCalledWith('integration-1')
    expect(dingtalkClient.downloadMessageFile).toHaveBeenCalledWith({
      downloadCode: 'download-code-1',
      robotCode: 'robot-code-1'
    })
    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          xpertId: 'xpert-1',
          input: '看这个图片',
          files: [
            expect.objectContaining({
              mimeType: 'image/png',
              originalName: 'photo.png',
              fileKey: 'download-code-1'
            })
          ]
        })
      })
    )
  })
	})
