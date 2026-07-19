import { LARK_ADMIN_TEMPLATE_KEY, LARK_CONVERSATION_TEMPLATE_KEY, LARK_RUNTIME_MIDDLEWARE_NAME } from './constants.js'
import { larkTemplates } from './lark.templates.js'

describe('larkTemplates', () => {
  it('does not attach the trigger-bound runtime to the non-triggered admin template', () => {
    const template = larkTemplates.find((item) => item.key === LARK_ADMIN_TEMPLATE_KEY)

    expect(template?.targetAppMeta?.xpert?.defaultConfig?.middlewareProviders).toEqual([])
  })

  it('uses one Lark runtime for local history, message sending, and remote messages', () => {
    const template = larkTemplates.find((item) => item.key === LARK_CONVERSATION_TEMPLATE_KEY)

    expect(template?.targetAppMeta?.xpert?.defaultConfig?.middlewareProviders).toEqual([LARK_RUNTIME_MIDDLEWARE_NAME])
    expect(template?.dslContent).toContain('provider: LarkRuntimeMiddleware')
    expect(template?.dslContent).toContain('required: false')
    expect(template?.dslContent).toContain('lark_search_chat_history')
    expect(template?.dslContent).toContain('includeFiles=true')
    expect(template?.dslContent).toContain('lark_send_file')
    expect(template?.dslContent).toContain('Never paste a local path or workspace path')
    expect(template?.dslContent).toContain('lark_list_messages')
    expect(template?.dslContent).not.toContain('provider: LarkLocalHistoryMiddleware')
    expect(template?.dslContent).not.toContain('provider: LarkNotifyMiddleware')
    expect(template?.dslContent).not.toContain('provider: LarkConversationContextMiddleware')
  })

  it('stores unmentioned group messages with explicit local history limits', () => {
    const template = larkTemplates.find((item) => item.key === LARK_CONVERSATION_TEMPLATE_KEY)

    expect(template?.dslContent).toContain('captureUnmentionedGroupMessages: true')
    expect(template?.dslContent).toContain('historyContextLimit: 20')
    expect(template?.dslContent).toContain('historyContextWindowSeconds: 3600')
    expect(template?.dslContent).toContain('historyRetentionDays: 30')
    expect(template?.dslContent).toContain('historyAttachmentMaxSizeMb: 10')
  })
})
