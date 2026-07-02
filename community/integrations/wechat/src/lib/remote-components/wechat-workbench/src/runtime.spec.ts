import { getResponsePayload, getSidecarConfigJson } from './runtime.js'

describe('wechat workbench remote runtime', () => {
  it('unwraps action result envelopes before checking success', () => {
    const result = {
      success: false,
      message: {
        en_US: '当前 key 已被其他用户使用，无法重复使用',
        zh_Hans: '当前 key 已被其他用户使用，无法重复使用'
      }
    }

    expect(
      getResponsePayload({
        type: 'actionResult',
        requestId: '1',
        result
      })
    ).toBe(result)
  })

  it('keeps direct action results intact instead of returning their data field', () => {
    const result = {
      success: true,
      data: {
        uuid: 'SDabc1234567'
      }
    }

    expect(getResponsePayload(result)).toBe(result)
  })

  it('continues to unwrap data response envelopes', () => {
    const data = {
      scope: 'integration',
      tableKey: 'accounts'
    }

    expect(
      getResponsePayload({
        type: 'data',
        requestId: '2',
        data
      })
    ).toBe(data)
  })

  it('uses the complete sidecar config JSON before falling back to legacy setup JSON', () => {
    const callbackConfig = {
      sidecarConfig: {
        XpertUrl: 'wss://api.example.com/api/wechat/tunnel/ws/integration-1',
        ListenHost: '127.0.0.1',
        ListenPort: 8088,
        MsgClientId: 'integration-1',
        MsgClientName: 'WeChat',
        AllMsgPushUrl: 'https://api.example.com/api/wechat/webhook/integration-1?secret=test',
        InAppPageUrl: 'http://127.0.0.1:8201'
      }
    }

    expect(getSidecarConfigJson(callbackConfig, { settingJson: '{"legacy":true}' })).toContain('"MsgClientId": "integration-1"')
    expect(getSidecarConfigJson({}, { settingJson: '{"legacy":true}' })).toBe('{"legacy":true}')
  })
})
