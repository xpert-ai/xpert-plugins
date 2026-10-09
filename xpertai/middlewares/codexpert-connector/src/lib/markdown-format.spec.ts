import { formatVisibleMarkdown, preserveMarkdownLineBreaks } from './markdown-format.js'

describe('preserveMarkdownLineBreaks', () => {
  it('keeps visible single line breaks in markdown text', () => {
    expect(preserveMarkdownLineBreaks('第一行\n第二行\n第三行')).toBe('第一行  \n第二行  \n第三行')
  })

  it('keeps a trailing line break when a flush boundary ends after newline', () => {
    expect(preserveMarkdownLineBreaks('第一行\n')).toBe('第一行  \n')
  })

  it('keeps paragraph breaks and fenced code blocks unchanged', () => {
    expect(preserveMarkdownLineBreaks('说明\n\n```ts\nconst a = 1\nconst b = 2\n```\n结束')).toBe(
      '说明\n\n```ts\nconst a = 1\nconst b = 2\n```\n结束'
    )
  })
})

describe('formatVisibleMarkdown', () => {
  it('separates standalone milestone text from following streamed text', () => {
    expect(formatVisibleMarkdown('已开始处理。', { standalone: true })).toBe('已开始处理。\n\n')
  })

  it('normalizes common compact markdown blocks', () => {
    expect(formatVisibleMarkdown('已完成。##文档内容概述###1.改动概述\n-重构目的')).toBe(
      '已完成。\n\n## 文档内容概述\n\n### 1.改动概述\n- 重构目的'
    )
  })
})
