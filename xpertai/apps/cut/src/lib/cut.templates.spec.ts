import { CUT_ICON } from './constants.js'
import { cutTemplates } from './cut.templates.js'

describe('Cut assistant template', () => {
  it('uses CUT_ICON as the team avatar', () => {
    const expectedAvatar = `data:image/svg+xml;base64,${Buffer.from(CUT_ICON, 'utf8').toString('base64')}`
    const dslContent = cutTemplates[0]?.dslContent

    expect(dslContent).toContain(`url: "${expectedAvatar}"`)
    expect(dslContent).not.toContain('__CUT_ICON_DATA_URL__')
  })
})
