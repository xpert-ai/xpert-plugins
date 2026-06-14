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
    expect(userTemplate).toContain('groupTriggerMode: mention_or_keywords')
    expect(userTemplate).toContain('integrationId: ""')
    expect(userTemplate).not.toContain('provider: wechat_personal')
    expect(userTemplate).not.toContain('from: integration')
  })

  it('keeps the admin assistant template free of inbound WeChat triggers', () => {
    const adminTemplate = readTemplate('xpert-wechat-personal-admin-assistant.yaml')

    expect(adminTemplate).not.toContain('type: trigger')
    expect(adminTemplate).not.toContain('from: wechat_personal')
  })
})
