jest.mock('@xpert-ai/plugin-sdk', () => ({
  ...require('../../../../test-utils/larkPluginSdkMock.cjs').createLarkPluginSdkMock(jest),
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error))
}))

import { Readable } from 'node:stream'
import { LarkApplicationPermissionError, LarkContextToolService } from './lark-context-tool.service.js'

async function createFixture() {
  const messageList = jest.fn().mockResolvedValue({
    data: {
      items: [
        {
          message_id: 'om_text_1',
          chat_id: 'oc_chat_1',
          msg_type: 'text',
          create_time: '1710000000000',
          sender: {
            id: 'ou_sender_1',
            id_type: 'open_id',
            sender_type: 'user'
          },
          body: {
            content: JSON.stringify({
              text: 'hello @_user_1'
            })
          },
          mentions: [
            {
              key: '@_user_1',
              id: 'ou_alice',
              id_type: 'open_id',
              name: 'Alice'
            }
          ]
        },
        {
          message_id: 'om_file_1',
          chat_id: 'oc_chat_1',
          msg_type: 'file',
          body: {
            content: JSON.stringify({
              file_key: 'file_1',
              file_name: 'report.pdf'
            })
          }
        }
      ],
      page_token: 'next-page',
      has_more: true
    }
  })

  const messageGet = jest.fn().mockResolvedValue({
    data: {
      items: [
        {
          message_id: 'om_file_1',
          chat_id: 'oc_chat_1',
          msg_type: 'file',
          body: {
            content: JSON.stringify({
              file_key: 'file_1',
              file_name: 'report.pdf'
            })
          }
        }
      ]
    }
  })

  const messageResourceGet = jest.fn().mockResolvedValue({
    headers: {
      'content-type': 'application/pdf',
      'content-length': '3',
      'content-disposition': 'attachment; filename="report.pdf"'
    },
    getReadableStream: () => Readable.from([Buffer.from('abc')])
  })

  const client = {
    im: {
      message: {
        list: messageList,
        get: messageGet
      },
      messageResource: {
        get: messageResourceGet
      }
    }
  }

  const larkChannel = {
    getOrCreateLarkClientById: jest.fn().mockResolvedValue(client),
    readIntegrationById: jest.fn().mockResolvedValue({
      id: 'integration-1',
      options: { appId: 'cli_test_app', isLark: false }
    }),
    createMessage: jest.fn().mockResolvedValue({ data: { message_id: 'permission-card-1' } })
  }

  return {
    service: new LarkContextToolService(larkChannel as any),
    larkChannel,
    messageList,
    messageGet,
    messageResourceGet
  }
}

describe('LarkContextToolService', () => {
  it('normalizes listMessages into agent-friendly message records', async () => {
    const { service, messageList } = await createFixture()

    const result = await service.listMessages({
      integrationId: 'integration-1',
      containerIdType: 'chat',
      containerId: 'oc_chat_1',
      timeoutMs: 1000
    })

    expect(messageList).toHaveBeenCalledWith({
      params: {
        container_id_type: 'chat',
        container_id: 'oc_chat_1',
        start_time: null,
        end_time: null,
        sort_type: undefined,
        page_size: undefined,
        page_token: null
      }
    })
    expect(result.pageToken).toBe('next-page')
    expect(result.hasMore).toBe(true)
    expect(result.items).toEqual([
      expect.objectContaining({
        messageId: 'om_text_1',
        chatId: 'oc_chat_1',
        senderOpenId: 'ou_sender_1',
        msgType: 'text',
        text: 'hello @Alice',
        mentions: [
          {
            openId: 'ou_alice',
            name: 'Alice',
            isBot: undefined
          }
        ],
        createTime: '1710000000000',
        hasResource: false,
        resourceRefs: undefined
      }),
      expect.objectContaining({
        messageId: 'om_file_1',
        chatId: 'oc_chat_1',
        msgType: 'file',
        hasResource: true,
        resourceRefs: [
          {
            fileKey: 'file_1',
            type: 'file',
            name: 'report.pdf'
          }
        ]
      })
    ])
  })

  it('preserves structured application permission failures without relying on a known error code', async () => {
    const { service, messageList } = await createFixture()
    messageList.mockRejectedValue({
      code: 12345678,
      msg: 'Access denied',
      error: {
        message: 'missing permission',
        permission_violations: [
          { type: 'action_privilege_required', subject: 'im:message.group_msg' }
        ]
      }
    })

    await expect(
      service.listMessages({
        integrationId: 'integration-1',
        containerIdType: 'chat',
        containerId: 'oc_chat_1'
      })
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'LarkApplicationPermissionError',
        code: 12345678,
        scopes: ['im:message.group_msg']
      })
    )
  })

  it('preserves application permission failures returned as successful SDK responses', async () => {
    const { service, messageList } = await createFixture()
    messageList.mockResolvedValue({
      code: 99991679,
      msg: 'Access denied',
      error: {
        message: 'missing permission',
        permission_violations: [
          { type: 'action_privilege_required', subject: 'im:message.group_msg' }
        ]
      }
    })

    await expect(
      service.listMessages({
        integrationId: 'integration-1',
        containerIdType: 'chat',
        containerId: 'oc_chat_1'
      })
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'LarkApplicationPermissionError',
        code: 99991679,
        scopes: ['im:message.group_msg']
      })
    )
  })

  it('does not infer application permissions from an error code or free-form message', async () => {
    const { service, messageList } = await createFixture()
    messageList.mockResolvedValue({
      code: 99991672,
      msg: 'Access denied. Required scope: im:message.group_msg',
      error: {
        message: 'The app does not have im:message.group_msg permission'
      }
    })

    const error = await service
      .listMessages({
        integrationId: 'integration-1',
        containerIdType: 'chat',
        containerId: 'oc_chat_1'
      })
      .catch((caught) => caught)

    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(LarkApplicationPermissionError)
  })

  it('does not treat a generic message operation error as missing application permission', async () => {
    const { service, messageList } = await createFixture()
    messageList.mockResolvedValue({
      code: 230027,
      msg: 'Lack of necessary permissions, ext=need scope: im:message.group_msg',
      error: {
        message: 'Lack of necessary permissions'
      }
    })

    const error = await service
      .listMessages({
        integrationId: 'integration-1',
        containerIdType: 'chat',
        containerId: 'oc_chat_1'
      })
      .catch((caught) => caught)

    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(LarkApplicationPermissionError)
  })

  it('sends a deterministic administrator permission guide card to the trusted chat', async () => {
    const { service, larkChannel } = await createFixture()

    await expect(
      service.sendApplicationPermissionGuideCard({
        integrationId: 'integration-1',
        chatId: 'oc_chat_1',
        scopes: ['im:message.group_msg'],
        toolCallId: 'tool-call-1'
      })
    ).resolves.toEqual({
      messageId: 'permission-card-1',
      consoleUrl:
        'https://open.feishu.cn/app/cli_test_app/auth?q=im%3Amessage.group_msg&op_from=openapi&token_type=tenant'
    })

    expect(larkChannel.createMessage).toHaveBeenCalledWith(
      'integration-1',
      expect.objectContaining({
        params: { receive_id_type: 'chat_id' },
        data: expect.objectContaining({
          receive_id: 'oc_chat_1',
          msg_type: 'interactive',
          uuid: expect.stringMatching(/^lark_permission_[a-f0-9]{32}$/)
        })
      })
    )
    const card = JSON.parse(larkChannel.createMessage.mock.calls[0][1].data.content)
    expect(card.header.title.content).toBe('🔐 请管理员开启以下权限')
    expect(card.elements[0].content).toContain('im:message.group_msg')
    expect(card.elements[1].elements[0].content).toContain('cli_test_app')
    expect(card.elements[2].actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: { tag: 'plain_text', content: '开启权限' },
          multi_url: {
            url: 'https://open.feishu.cn/app/cli_test_app/auth?q=im%3Amessage.group_msg&op_from=openapi&token_type=tenant'
          }
        }),
        expect.objectContaining({
          text: { tag: 'plain_text', content: '取消' },
          value: { action: 'lark-dismiss-permission-guide' }
        })
      ])
    )
  })

  it('rejects list responses containing messages outside the trusted current chat', async () => {
    const { service, messageList } = await createFixture()
    messageList.mockResolvedValue({
      data: {
        items: [
          {
            message_id: 'om_other_chat',
            chat_id: 'oc_chat_other',
            msg_type: 'text',
            body: { content: JSON.stringify({ text: 'private' }) }
          }
        ]
      }
    })

    await expect(
      service.listMessages({
        integrationId: 'integration-1',
        containerIdType: 'chat',
        containerId: 'oc_chat_current',
        expectedChatId: 'oc_chat_current',
        timeoutMs: 1000
      })
    ).rejects.toThrow('Lark returned a message outside the current chat')
  })

  it('normalizes getMessageResource into metadata plus optional base64 payload', async () => {
    const { service, messageResourceGet } = await createFixture()

    const result = await service.getMessageResource({
      integrationId: 'integration-1',
      messageId: 'om_file_1',
      fileKey: 'file_1',
      type: 'file',
      contentMode: 'base64',
      timeoutMs: 1000
    })

    expect(messageResourceGet).toHaveBeenCalledWith({
      params: {
        type: 'file'
      },
      path: {
        message_id: 'om_file_1',
        file_key: 'file_1'
      }
    })
    expect(result.item).toEqual({
      messageId: 'om_file_1',
      fileKey: 'file_1',
      type: 'file',
      name: 'report.pdf',
      mimeType: 'application/pdf',
      size: 3,
      contentEncoding: 'base64',
      contentBase64: 'YWJj'
    })
  })

  it('rejects messages returned outside the trusted current chat', async () => {
    const { service, messageGet } = await createFixture()
    messageGet.mockResolvedValue({
      data: {
        items: [
          {
            message_id: 'om_other_chat',
            chat_id: 'oc_chat_other',
            msg_type: 'text',
            body: { content: JSON.stringify({ text: 'private' }) }
          }
        ]
      }
    })

    await expect(
      service.getMessage({
        integrationId: 'integration-1',
        messageId: 'om_other_chat',
        expectedChatId: 'oc_chat_current',
        timeoutMs: 1000
      })
    ).rejects.toThrow('Lark returned a message outside the current chat')
  })

  it('does not download resources until current-chat membership is verified', async () => {
    const { service, messageGet, messageResourceGet } = await createFixture()
    messageGet.mockResolvedValue({
      data: {
        items: [
          {
            message_id: 'om_other_chat',
            chat_id: 'oc_chat_other',
            msg_type: 'file',
            body: { content: JSON.stringify({ file_key: 'file_1' }) }
          }
        ]
      }
    })

    await expect(
      service.getMessageResource({
        integrationId: 'integration-1',
        messageId: 'om_other_chat',
        fileKey: 'file_1',
        type: 'file',
        expectedChatId: 'oc_chat_current',
        timeoutMs: 1000
      })
    ).rejects.toThrow('Lark returned a message outside the current chat')
    expect(messageResourceGet).not.toHaveBeenCalled()
  })
})
