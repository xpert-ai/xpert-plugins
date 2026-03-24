import { Readable } from 'node:stream'
import { LarkContextToolService } from './lark-context-tool.service.js'

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
    getOrCreateLarkClientById: jest.fn().mockResolvedValue(client)
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
        start_time: undefined,
        end_time: undefined,
        sort_type: undefined,
        page_size: undefined,
        page_token: undefined
      }
    })
    expect(result.pageToken).toBe('next-page')
    expect(result.hasMore).toBe(true)
    expect(result.items).toEqual([
      {
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
      },
      {
        messageId: 'om_file_1',
        chatId: 'oc_chat_1',
        msgType: 'file',
        text: 'report.pdf',
        hasResource: true,
        resourceRefs: [
          {
            fileKey: 'file_1',
            type: 'file',
            name: 'report.pdf'
          }
        ]
      }
    ])
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
})
