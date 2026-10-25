import { BlockMath, InlineMath } from '@tiptap/extension-mathematics'
import katex from 'katex'
import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'

/** Same rendering/size limits on server, preview and editor; never trust TeX HTML/URL commands. */
export const mathOptions = { trust: false, strict: 'ignore' as const, throwOnError: true, maxExpand: 500, maxSize: 20 }
export function validateMath(latex: unknown, inline = false): asserts latex is string {
  if (typeof latex !== 'string' || !latex.trim() || latex.length > 4096 || /\$/u.test(latex) || (inline && /[\r\n]/u.test(latex)))
    throw new Error('公式需为 1–4096 字符的 LaTeX，不含 $ 分隔符；行内公式不能换行。')
  katex.renderToString(latex, { ...mathOptions, displayMode: !inline })
}
export const blockMathTokenizer = (src: string) => {
  const match = /^\$\$\s*\n?([^$]+?)\n?\$\$(?:[ \t]*(?:\n|$))/u.exec(src)
  return match ? { type: 'blockMath', raw: match[0], latex: match[1].trim() } : undefined
}
export const inlineMathTokenizer = (src: string) => {
  const match = /^\$([^$\r\n]+)\$(?![\d$])/u.exec(src)
  return match && match[1].trim() === match[1] ? { type: 'inlineMath', raw: match[0], latex: match[1] } : undefined
}
// Distinguish atoms by stable identity while an editing dialog is open under concurrent updates.
export const MathIdentity = Extension.create({ name: 'mathIdentity',
  addGlobalAttributes() { return [{ types: ['inlineMath', 'blockMath'], attributes: { mathId: { default: null } } }] },
  addProseMirrorPlugins() { return [new Plugin({ appendTransaction(transactions, _old, state) {
    if (!transactions.some((tr) => tr.docChanged)) return null
    const seen = new Set<string>(), tr = state.tr
    state.doc.descendants((node, pos) => {
      if (!['inlineMath', 'blockMath'].includes(node.type.name)) return
      let id: unknown = node.attrs.mathId
      if (typeof id !== 'string' || !id || seen.has(id)) {
        id = globalThis.crypto.randomUUID(); tr.setNodeMarkup(pos, undefined, { ...node.attrs, mathId: id })
      }
      if (typeof id === 'string') seen.add(id)
    })
    return tr.docChanged ? tr : null
  } })] }
})
export const mathExtensions = [
  BlockMath.extend({ markdownTokenizer: { name: 'blockMath', level: 'block', start: (src) => src.indexOf('$$'), tokenize: blockMathTokenizer } })
    .configure({ katexOptions: { ...mathOptions, displayMode: true } }),
  InlineMath.extend({ markdownTokenizer: { name: 'inlineMath', level: 'inline', start: (src) => src.indexOf('$'), tokenize: inlineMathTokenizer } })
    .configure({ katexOptions: mathOptions }), MathIdentity
]
