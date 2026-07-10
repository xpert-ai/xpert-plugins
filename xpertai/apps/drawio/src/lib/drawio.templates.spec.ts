import assert from 'node:assert/strict'
import test from 'node:test'
import { drawioTemplates } from './drawio.templates.js'

const teamDescription = [
  '  description:',
  '    en_US: Agentic Drawing assistant for flowcharts, architecture diagrams, wireframes, and freeform whiteboards',
  '    zh_Hans: 面向流程图、架构图、线框图和自由白板的 Agentic Drawing 助手'
].join('\n')

const agentDescription = [
  '      description:',
  '        en_US: Agentic Drawing assistant for flowcharts, architecture diagrams, wireframes, and freeform whiteboards',
  '        zh_Hans: 面向流程图、架构图、线框图和自由白板的 Agentic Drawing 助手'
].join('\n')

test('localizes the draw.io installed assistant descriptions', () => {
  const template = drawioTemplates[0]

  assert.equal(template.description, '面向流程图、架构图、线框图和自由白板的 data-xpert draw.io 绘图助手模板。')
  assert.match(template.dslContent ?? '', /description:\n    en_US:/)
  assert.match(template.dslContent ?? '', /description:\n        en_US:/)
  assert.ok(template.dslContent?.includes(teamDescription))
  assert.ok(template.dslContent?.includes(agentDescription))
})
