import { buildWeComRestartConversationCard, buildWeComWelcomeCard } from './wecom-conversation-action-card.js'

describe('WeCom conversation action cards', () => {
  it.each([
    ['restart', buildWeComRestartConversationCard],
    ['welcome', buildWeComWelcomeCard]
  ])('%s card includes a valid top-level card_action for WeCom template cards', (_name, builder) => {
    expect(builder()).toEqual(
      expect.objectContaining({
        card_action: {
          type: 1,
          url: 'https://work.weixin.qq.com/'
        }
      })
    )
  })
})
