import type { Sample } from './adapter.js'
import { adapter } from './adapter.js'
import { currentLocale } from './i18n.js'

const messages = {
  en: { edit: 'Help me edit', explain: 'Explain', added: 'Referenced in chat. Enter your question or change request there.', failed: 'Reference was not added. Check that the updated assistant is ready and retry.', saveFirst: 'Save the file successfully before asking AI to edit it. Your local text does not match the saved version.', tooLarge: 'This file is too large. Select a smaller excerpt (up to 200,000 characters).' },
  zh: { edit: '帮我改', explain: '解释一下', added: '已引用到聊天，请在那里输入问题或修改要求。', failed: '引用未添加，请确认新版助手已就绪后重试。', saveFirst: '请先成功保存文件，再让 AI 修改；当前文本与已保存版本不一致。', tooLarge: '文件太大，请打开后选择较短的片段（最多 200,000 字符）。' }
}

/** References capture the current buffer, including unsaved edits, without sending a message. */
export function mountSelectionReferenceMenu(sample: Sample) {
  const handle = (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    let path: string, text: string, fullText: string, startLine: number, endLine: number
    if (target instanceof HTMLTextAreaElement && target.dataset.editor) {
      path = target.dataset.editor
      fullText = target.value
      const start = target.selectionStart, end = target.selectionEnd
      text = target.value.slice(start, end)
      if (!text.trim()) return
      startLine = target.value.slice(0, start).split('\n').length
      endLine = target.value.slice(0, end - (text.endsWith('\n') ? 1 : 0)).split('\n').length
    } else {
      const row = target.closest<HTMLElement>('[data-file]')
      const id = row?.dataset.file
      // Welcome, preview, reference help and tool panels are not files.
      if (!id || !sample.buffers.has(id)) return
      path = id
      text = sample.buffers.get(id)!
      fullText = text
      if (!text.trim()) return
      startLine = 1
      endLine = text.replace(/\n$/, '').split('\n').length
    }
    event.preventDefault()
    event.stopPropagation()
    const copy = currentLocale() === 'zh-Hans' ? messages.zh : messages.en
    if (text.length > 200000) { sample.toast(copy.tooLarge); return }
    const reference = { type: 'code' as const, path, text, startLine, endLine }
    let adding = false
    const rect = target.getBoundingClientRect()
    sample.manager.ShowMenu(['edit', 'explain'].map(action => ({
      label: action === 'edit' ? copy.edit : copy.explain,
      Execute: () => {
        if (adding) return
        adding = true
        void (async () => {
          const revision = action === 'edit' ? await adapter.editReferenceRevision(path, fullText) : null
          const label = `${action === 'edit' ? copy.edit : copy.explain} · ${path}${revision === null ? '' : ` · buffers revision=${revision}`}`
          return adapter.bridge.appendReferences([{ ...reference, label }])
        })()
          .then(() => sample.toast(copy.added))
          .catch(error => { adding = false; sample.toast(error instanceof Error && error.message === 'save_before_edit' ? copy.saveFirst : copy.failed) })
      }
    })), event.clientX || rect.left + 12, event.clientY || rect.top + 12, path)
  }
  document.addEventListener('contextmenu', handle, true)
  const dispose = () => document.removeEventListener('contextmenu', handle, true)
  window.addEventListener('pagehide', dispose, { once: true })
  return dispose
}
