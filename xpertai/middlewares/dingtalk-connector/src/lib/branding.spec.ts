import { DINGTALK_CONNECTOR_ICON } from './branding.js'

describe('DingTalk connector branding', () => {
  it('exposes the DingTalk SVG as an image data URL supported by connector cards', () => {
    expect(DINGTALK_CONNECTOR_ICON.type).toBe('image')
    expect(DINGTALK_CONNECTOR_ICON.value).toMatch(/^data:image\/svg\+xml;charset=utf-8,/)
    expect(DINGTALK_CONNECTOR_ICON.size).toBe(24)

    const svg = decodeURIComponent(DINGTALK_CONNECTOR_ICON.value.split(',', 2)[1])
    expect(svg).toContain('<svg')
    expect(svg).toContain('viewBox="0 0 1024 1024"')
    expect(svg).toContain('M512 64')
  })
})
