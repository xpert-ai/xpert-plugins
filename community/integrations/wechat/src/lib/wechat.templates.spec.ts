import { readFileSync } from 'fs'
import { join } from 'path'

function readTemplate(templateFile: string) {
  return readFileSync(join(process.cwd(), 'src', templateFile), 'utf8')
}

describe('wechatTemplates', () => {
  it('keeps the user assistant trigger DSL aligned with the wechat provider shape', () => {
    const userTemplate = readTemplate('xpert-wechat-user-assistant.yaml')

    expect(userTemplate).toContain('type: trigger')
    expect(userTemplate).toContain('from: wechat')
    expect(userTemplate).toContain('sessionTimeoutSeconds: 3600')
    expect(userTemplate).toContain('summaryWindowSeconds: 0')
    expect(userTemplate).toContain('historyContextLimit: 20')
    expect(userTemplate).toContain('historyContextWindowSeconds: 3600')
    expect(userTemplate).toContain('ignoreSelfMessages: true')
    expect(userTemplate).toContain('selfMessagePolicy: history_only')
    expect(userTemplate).toContain('chatFilterMode: all')
    expect(userTemplate).toContain('allowedGroupIds: []')
    expect(userTemplate).toContain('blockedGroupIds: []')
    expect(userTemplate).toContain('allowedSenderIds: []')
    expect(userTemplate).toContain('blockedSenderIds: []')
    expect(userTemplate).toContain('allowedKeywords: []')
    expect(userTemplate).toContain('groupTriggerMode: mention_or_keywords')
    expect(userTemplate).toContain('groupKeywords: []')
    expect(userTemplate).toContain('mentionFallbackNames: []')
    expect(userTemplate).toContain('groupTriggerOverrides: []')
    expect(userTemplate).toContain('groupJoinWelcomeEnabled: false')
    expect(userTemplate).toContain('groupJoinWelcomePrompt: "微信群有新成员加入：{names}。')
    expect(userTemplate).toContain('stateVariables:')
    expect(userTemplate).toContain('stateVariables: []')
    expect(userTemplate).toContain('toolMode: user')
    expect(userTemplate).toContain('integrationId: ""')
    expect(userTemplate).toContain('wechat_search_chat_history')
    expect(userTemplate).not.toContain('scheduleTargets:')
    expect(userTemplate).not.toContain('provider: wechat')
    expect(userTemplate).not.toContain('from: integration')
  })

  it('keeps the admin assistant template free of inbound WeChat triggers', () => {
    const adminTemplate = readTemplate('xpert-wechat-admin-assistant.yaml')

    expect(adminTemplate).not.toContain('type: trigger')
    expect(adminTemplate).not.toContain('from: wechat')
    expect(adminTemplate).toContain('toolMode: admin')
  })
})
