import { formatWechatPersonalOutgoingText } from './wechat-personal-text-format.js'
import { parseWechatPersonalOutgoingContent } from './wechat-personal-outgoing-content.js'

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

describe('parseWechatPersonalOutgoingContent', () => {
  it('splits markdown images and text in the original order', () => {
    expect(
      parseWechatPersonalOutgoingContent(`先看这张图：

![方案图](https://example.com/a.png)

然后继续说明。`)
    ).toEqual([
      { type: 'text', content: '先看这张图：' },
      { type: 'image', imageUrl: 'https://example.com/a.png', alt: '方案图' },
      { type: 'text', content: '然后继续说明。' }
    ])
  })

  it('treats a bare standalone http URL as an image candidate', () => {
    expect(parseWechatPersonalOutgoingContent('https://example.com/render?id=1')).toEqual([
      { type: 'image', imageUrl: 'https://example.com/render?id=1' }
    ])
  })

  it('keeps normal markdown links as text', () => {
    expect(parseWechatPersonalOutgoingContent('See [docs](https://example.com/docs).')).toEqual([
      { type: 'text', content: 'See docs: https://example.com/docs.' }
    ])
  })

  it('extracts markdown links whose URL points at an image', () => {
    expect(parseWechatPersonalOutgoingContent('查看 [插件图](http://localhost:3333/api/images/x.png)')).toEqual([
      { type: 'text', content: '查看' },
      { type: 'image', imageUrl: 'http://localhost:3333/api/images/x.png', alt: '插件图' }
    ])
  })

  it('extracts inline image URLs while preserving adjacent text', () => {
    expect(parseWechatPersonalOutgoingContent('图片：http://localhost:3333/api/images/x.png')).toEqual([
      { type: 'text', content: '图片：' },
      { type: 'image', imageUrl: 'http://localhost:3333/api/images/x.png' }
    ])
  })

  it('does not extract image URLs inside code blocks', () => {
    expect(
      parseWechatPersonalOutgoingContent(`\`\`\`md
![x](https://example.com/a.png)
\`\`\``)
    ).toEqual([{ type: 'text', content: '![x](https://example.com/a.png)' }])
  })
})
