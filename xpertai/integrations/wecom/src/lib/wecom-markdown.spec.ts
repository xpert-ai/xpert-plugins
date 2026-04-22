import { convertMarkdownToWeComMarkdown } from './wecom-markdown.js'

describe('convertMarkdownToWeComMarkdown', () => {
  it('normalizes headings, lists, bold text, tables, and horizontal rules', () => {
    const input = [
      '##一级评估要点',
      '',
      '__要求1：__ 应在关键工序应用自动化设备',
      '*查证证据：关键工序设备台账',
      '+抽样数据：现场查看关键工序设备自动化应用情况',
      '',
      '| 指标 | 说明 |',
      '| --- | --- |',
      '| 自动化 | 已覆盖 |',
      '| 数字化 | 部分覆盖 |',
      '',
      '***'
    ].join('\n')

    expect(convertMarkdownToWeComMarkdown(input)).toBe(
      [
        '## 一级评估要点',
        '',
        '**要求1：** 应在关键工序应用自动化设备',
        '- 查证证据：关键工序设备台账',
        '- 抽样数据：现场查看关键工序设备自动化应用情况',
        '',
        '- **指标:** 自动化; **说明:** 已覆盖',
        '- **指标:** 数字化; **说明:** 部分覆盖',
        '',
        '---'
      ].join('\n')
    )
  })

  it('keeps fenced code blocks unchanged while converting surrounding markdown', () => {
    const input = ['#标题', '', '```md', '##Raw', '| A | B |', '```', '', '-列表项'].join('\n')

    expect(convertMarkdownToWeComMarkdown(input)).toBe(['# 标题', '', '```md', '##Raw', '| A | B |', '```', '', '- 列表项'].join('\n'))
  })
})
