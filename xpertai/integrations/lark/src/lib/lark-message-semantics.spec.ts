import { extractLarkSemanticMessage } from './lark-message-semantics.js'

describe('lark-message-semantics', () => {
  it('extracts semantic message from real event envelope structure', () => {
    const semanticMessage = extractLarkSemanticMessage({
      schema: '2.0',
      header: {
        event_type: 'im.message.receive_v1'
      },
      event: {
        message: {
          message_id: 'om_1',
          chat_id: 'oc_1',
          chat_type: 'group',
          message_type: 'text',
          create_time: '1710000000000',
          update_time: '1710000000000',
          content: JSON.stringify({
            text: '<at user_id="ou_user_1">李林浩</at> 你看到了什么？<at user_id="ou_user_2">飞书测试</at>'
          }),
          mentions: [
            {
              key: '@_user_1',
              id: 'ou_user_1',
              id_type: 'open_id',
              name: '李林浩'
            },
            {
              key: '@_user_2',
              id: 'ou_user_2',
              id_type: 'open_id',
              name: '飞书测试'
            }
          ]
        },
        sender: {
          sender_id: {
            open_id: 'ou_sender_1',
            union_id: 'uu_sender_1',
            user_id: 'user_sender_1'
          },
          sender_type: 'user',
          tenant_key: 'tenant-1'
        }
      }
    })

    expect(semanticMessage).toEqual({
      rawText: '<at user_id="ou_user_1">李林浩</at> 你看到了什么？<at user_id="ou_user_2">飞书测试</at>',
      displayText: '@李林浩 你看到了什么？@飞书测试',
      agentText: '@李林浩 你看到了什么？@飞书测试',
      mentions: [
        expect.objectContaining({
          key: '@_user_1',
          id: 'ou_user_1',
          idType: 'open_id',
          name: '李林浩',
          rawToken: '<at user_id="ou_user_1">李林浩</at>'
        }),
        expect.objectContaining({
          key: '@_user_2',
          id: 'ou_user_2',
          idType: 'open_id',
          name: '飞书测试',
          rawToken: '<at user_id="ou_user_2">飞书测试</at>'
        })
      ]
    })
  })

  it('supports legacy mention id object shape', () => {
    const semanticMessage = extractLarkSemanticMessage({
      message: {
        message_id: 'om_legacy',
        chat_id: 'oc_legacy',
        chat_type: 'group',
        message_type: 'text',
        create_time: '1710000000000',
        update_time: '1710000000000',
        content: JSON.stringify({
          text: '<at user_id="ou_user_legacy">Tom</at> hi'
        }),
        mentions: [
          {
            key: '@_user_1',
            id: {
              open_id: 'ou_user_legacy'
            },
            name: 'Tom'
          }
        ]
      }
    })

    expect(semanticMessage?.mentions[0]).toEqual(
      expect.objectContaining({
        id: 'ou_user_legacy',
        idType: 'open_id',
        name: 'Tom'
      })
    )
  })
})
