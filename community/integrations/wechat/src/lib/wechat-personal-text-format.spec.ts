import { formatWechatPersonalOutgoingText } from './wechat-personal-text-format.js'

describe('formatWechatPersonalOutgoingText', () => {
  it('converts common markdown into WeChat-friendly plain text', () => {
    expect(
      formatWechatPersonalOutgoingText(`# Title

**Important** update:
- [x] done
- [ ] next

See [docs](https://example.com/docs).

| Name | Value |
| --- | --- |
| A | 1 |
`)
    ).toBe(`Title

Important update:
- done
- next

See docs: https://example.com/docs.

Name | Value
A | 1`)
  })

  it('preserves code content while removing markdown fences', () => {
    expect(
      formatWechatPersonalOutgoingText(`Use this:

\`\`\`ts
const value = "**not bold**"
\`\`\`

Then send it.`)
    ).toBe(`Use this:

const value = "**not bold**"

Then send it.`)
  })

  it('keeps plain text unchanged except outer whitespace', () => {
    expect(formatWechatPersonalOutgoingText('  hello\nworld  ')).toBe('hello\nworld')
  })
})
