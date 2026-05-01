import {
  getWeComRestartConversationTitle,
  getWeComStartNewChatLabel,
  getWeComWelcomeDescription,
  getWeComWelcomeTitle
} from './wecom-conversation-text.js'

const WECOM_TEMPLATE_CARD_ACTION = {
  type: 1,
  url: 'https://work.weixin.qq.com/'
} as const

export function buildWeComRestartConversationCard(language?: string | null): Record<string, unknown> {
  return {
    card_type: 'text_notice',
    card_action: WECOM_TEMPLATE_CARD_ACTION,
    main_title: {
      title: getWeComRestartConversationTitle(language)
    },
    jump_list: [
      {
        type: 3,
        title: getWeComStartNewChatLabel(language),
        question: '/new'
      }
    ]
  }
}

export function buildWeComWelcomeCard(language?: string | null): Record<string, unknown> {
  return {
    card_type: 'text_notice',
    card_action: WECOM_TEMPLATE_CARD_ACTION,
    main_title: {
      title: getWeComWelcomeTitle(language),
      desc: getWeComWelcomeDescription(language)
    },
    jump_list: [
      {
        type: 3,
        title: getWeComStartNewChatLabel(language),
        question: '/new'
      }
    ]
  }
}
