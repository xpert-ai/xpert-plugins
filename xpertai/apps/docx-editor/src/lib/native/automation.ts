import { createServerAutomationHost, type AutomationHost } from '@docx-editor.dev/core/automation'
import { blankDocumentBytes } from '@docx-editor.dev/core'
import { templates, type EngineInput, type EngineOutput } from './ai-schema.js'

type Operation = Parameters<AutomationHost['execute']>[0]['operations'][number]
type Value = Extract<ReturnType<AutomationHost['execute']>['results'][number], { status: 'ok' }>['value']
type Handle = Extract<Value, { kind: 'handle' }>['handle']
function execute(host: AutomationHost, operation: Operation) {
  const response = host.execute({ operations: [operation] }), result = response.results[0]
  if (!response.ok || result?.status !== 'ok') throw new Error(`docx.operation_refused:${result?.status === 'error' ? result.error.code : 'failed'}`)
  return result.value
}
function handle(value: Value): Handle { if (value.kind !== 'handle') throw new Error('docx.invalid_handle'); return value.handle }
function handles(value: Value): readonly Handle[] { if (value.kind !== 'handles') throw new Error('docx.invalid_handles'); return value.handles }
function text(value: Value) { if (value.kind !== 'text') throw new Error('docx.invalid_text'); return value.text }

/** Every operation uses the upstream canonical tree. Only the final successful package is published. */
export function automate(input: EngineInput): EngineOutput {
  const opened = createServerAutomationHost(input.action === 'create' ? blankDocumentBytes() : input.buffer ?? new Uint8Array())
  if (!opened.ok) throw new Error('docx.invalid_package')
  const h = opened.host
  try {
    const document = handle(execute(h, { op: 'getDocument' })), body = handle(execute(h, { op: 'getBody', document }))
    const paragraphs = () => handles(execute(h, { op: 'getParagraphs', body }))
    const readText = (target: Handle) => text(execute(h, { op: 'getText', target, projection: 'model' }))
    const controls = () => handles(execute(h, { op: 'getContentControls', scope: { body } }))
    if (input.action === 'inspect') {
      const all = paragraphs()
      if (all.length > 10000) throw new Error('docx.paragraph_limit')
      return { total: all.length, paragraphs: all.slice(input.offset, input.offset + input.limit).map(paragraph => {
        const content = readText(paragraph)
        return { paragraphId: text(execute(h, { op: 'getParagraphId', paragraph })), text: content.slice(0, 12000), truncated: content.length > 12000 }
      }), slots: controls().slice(0, 60).map(contentControl => ({
        tag: text(execute(h, { op: 'getContentControlTag', contentControl })),
        title: text(execute(h, { op: 'getContentControlTitle', contentControl })),
        type: text(execute(h, { op: 'getContentControlSubtype', contentControl })),
        lock: text(execute(h, { op: 'getContentControlLock', contentControl }))
      })) }
    }
    if (input.action === 'create') {
      const { title, blocks, templateId } = input.input
      if (!title || !blocks?.length) throw new Error('docx.invalid_plan')
      // Insert plain paragraphs before applying styles: upstream insertParagraph inherits
      // its predecessor's heading/list properties, which must not leak into the next block.
      const contents = [title, ...blocks.flatMap(block => block.kind === 'table' ? [''] : block.kind === 'list' ? block.items : [block.text])]
      execute(h, { op: 'replaceStoryBlocks', body, paragraphs: contents })
      const targets = paragraphs(), brand = templates.find(item => item.id === templateId)?.color ?? '#10263A'
      execute(h, { op: 'setStyle', span: { paragraph: targets[0] }, name: 'Title' })
      execute(h, { op: 'setFont', span: { paragraph: targets[0] }, font: { color: brand } })
      let cursor = 1
      for (const block of blocks) {
        const paragraph = targets[cursor++]
        if (block.kind === 'table') {
          const rows = block.rows
          if (!rows?.length || rows.some(row => row.length !== rows[0].length)) throw new Error('docx.ragged_table')
          execute(h, { op: 'insertTable', span: { paragraph }, location: 'Before', rowCount: rows.length, columnCount: rows[0].length, values: rows })
        } else if (block.kind === 'list') {
          const list = handle(execute(h, { op: 'startNewList', paragraph }))
          const result = execute(h, { op: 'getListId', list })
          if (result.kind !== 'number') throw new Error('docx.invalid_list')
          for (let item = 1; item < block.items.length; item++) execute(h, { op: 'attachToList', paragraph: targets[cursor++], listId: result.value, level: 0 })
        } else if (block.kind === 'heading') {
          execute(h, { op: 'setStyle', span: { paragraph }, name: `Heading ${block.level}` })
          execute(h, { op: 'setFont', span: { paragraph }, font: { color: brand } })
        }
      }
    } else if (input.action === 'apply') {
      const seen = new Set<string>()
      for (const edit of input.edits ?? []) {
        if (!edit.paragraphId || edit.text === undefined || seen.has(edit.paragraphId)) throw new Error('docx.invalid_target')
        seen.add(edit.paragraphId)
        const matched = paragraphs().filter(paragraph => text(execute(h, { op: 'getParagraphId', paragraph })) === edit.paragraphId)
        if (matched.length !== 1 || readText(matched[0]) !== edit.expectedText) throw new Error('docx.target_changed')
        const paragraph = matched[0]
        execute(h, { op: 'replaceSpan', span: { paragraph }, text: edit.text })
        if (edit.style && edit.style !== 'preserve') execute(h, { op: 'setStyle', span: { paragraph }, name: edit.style })
      }
    } else if (input.action === 'fill') {
      const seen = new Set<string>()
      for (const slot of input.slots ?? []) {
        if (!slot.tag || slot.text === undefined || seen.has(slot.tag)) throw new Error('docx.invalid_slot')
        seen.add(slot.tag)
        const matched = controls().filter(contentControl => text(execute(h, { op: 'getContentControlTag', contentControl })) === slot.tag)
        if (matched.length !== 1) throw new Error('docx.ambiguous_slot')
        execute(h, { op: 'setContentControlValue', contentControl: matched[0], value: { kind: 'text', text: slot.text } })
      }
    }
    const saved = h.save()
    if (!saved.ok) throw new Error('docx.export_failed')
    return { buffer: saved.bytes }
  } finally { h.dispose() }
}
