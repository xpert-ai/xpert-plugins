import assert from 'node:assert/strict'
import test from 'node:test'
import { lucidchartTemplates } from './lucidchart.templates.js'

const teamDescription = [
  '  description:',
  '    en_US: Agentic Drawing assistant for Lucidchart Standard Import drafts, Mermaid drafts, and external Lucid document registration',
  '    zh_Hans: 面向 Lucidchart Standard Import 草稿、Mermaid 草稿和外部 Lucid 文档登记的 Agentic Drawing 助手'
].join('\n')

const agentDescription = [
  '      description:',
  '        en_US: Agentic Drawing assistant for Lucidchart Standard Import drafts, Mermaid drafts, and external Lucid document registration',
  '        zh_Hans: 面向 Lucidchart Standard Import 草稿、Mermaid 草稿和外部 Lucid 文档登记的 Agentic Drawing 助手'
].join('\n')

test('localizes the Lucidchart installed assistant descriptions', () => {
  const template = lucidchartTemplates[0]

  assert.equal(
    template.description,
    '面向 Lucidchart Standard Import 草稿、Mermaid 草稿和外部 Lucid 文档登记的 data-xpert 绘图助手模板。'
  )
  assert.match(template.dslContent ?? '', /description:\n    en_US:/)
  assert.match(template.dslContent ?? '', /description:\n        en_US:/)
  assert.ok(template.dslContent?.includes(teamDescription))
  assert.ok(template.dslContent?.includes(agentDescription))
})
