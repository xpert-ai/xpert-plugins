import assert from 'node:assert/strict'
import test from 'node:test'
import { docxEditorTemplates } from './docx-editor.templates.js'

const teamDescription = [
  '  description:',
  '    en_US: Business assistant for DOCX online editing, comments, tracked-change suggestions, and versioned saving',
  '    zh_Hans: 面向 DOCX 在线编辑、批注、修订建议和版本化保存的业务助手'
].join('\n')

const agentDescription = [
  '      description:',
  '        en_US: Business assistant for DOCX online editing, comments, tracked-change suggestions, and versioned saving',
  '        zh_Hans: 面向 DOCX 在线编辑、批注、修订建议和版本化保存的业务助手'
].join('\n')

test('localizes the DOCX Editor installed assistant descriptions', () => {
  const template = docxEditorTemplates[0]

  assert.equal(
    template.description,
    'A data-xpert document assistant template for DOCX uploads, online editing, comments, tracked-change suggestions, and versioned saves.'
  )
  assert.match(template.dslContent ?? '', /description:\n    en_US:/)
  assert.match(template.dslContent ?? '', /description:\n        en_US:/)
  assert.ok(template.dslContent?.includes(teamDescription))
  assert.ok(template.dslContent?.includes(agentDescription))
})
