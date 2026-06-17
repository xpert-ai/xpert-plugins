import { readFileSync } from 'fs'
import { join } from 'path'

function readTemplate(templateFile: string) {
  return readFileSync(join(process.cwd(), 'src', templateFile), 'utf8')
}

describe('wechatPersonalTemplates', () => {
  it('keeps the user assistant trigger DSL aligned with the wechat_personal provider shape', () => {
    const userTemplate = readTemplate('xpert-wechat-personal-user-assistant.yaml')

    expect(userTemplate).toContain('type: trigger')
    expect(userTemplate).toContain('from: wechat_personal')
    expect(userTemplate).toContain('sessionTimeoutSeconds: 3600')
    expect(userTemplate).toContain('summaryWindowSeconds: 0')
    expect(userTemplate).toContain('historyContextLimit: 20')
    expect(userTemplate).toContain('ignoreSelfMessages: true')
    expect(userTemplate).toContain('chatFilterMode: all')
    expect(userTemplate).toContain('allowedGroupIds: []')
    expect(userTemplate).toContain('blockedGroupIds: []')
    expect(userTemplate).toContain('allowedSenderIds: []')
    expect(userTemplate).toContain('blockedSenderIds: []')
    expect(userTemplate).toContain('groupTriggerMode: mention_or_keywords')
    expect(userTemplate).toContain('mentionFallbackNames: []')
    expect(userTemplate).toContain('stateVariables:')
    expect(userTemplate).toContain('stateVariables: []')
    expect(userTemplate).toContain('toolMode: user')
    expect(userTemplate).toContain('integrationId: ""')
    expect(userTemplate).not.toContain('scheduleTargets:')
    expect(userTemplate).not.toContain('provider: wechat_personal')
    expect(userTemplate).not.toContain('from: integration')
  })

  it('keeps the admin assistant template free of inbound WeChat triggers', () => {
    const adminTemplate = readTemplate('xpert-wechat-personal-admin-assistant.yaml')

    expect(adminTemplate).not.toContain('type: trigger')
    expect(adminTemplate).not.toContain('from: wechat_personal')
    expect(adminTemplate).toContain('toolMode: admin')
  })
})
