import { useEffect, useRef } from 'react'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import 'monaco-editor/esm/vs/basic-languages/sql/sql.contribution'
import { format } from 'sql-formatter'
import type { DatabaseEngine } from '@xpert-ai/plugin-sdk/data-workbench'
declare const __EDITOR_WORKER__: string
const environment = globalThis as typeof globalThis & { MonacoEnvironment?: monaco.Environment }
environment.MonacoEnvironment = {
  getWorker: () => new Worker(URL.createObjectURL(new Blob([__EDITOR_WORKER__], { type: 'text/javascript' }))),
}
export interface EditorHandle {
  selection(): string
  format(): void
  focus(): void
}
export function SqlEditor({
  value,
  onChange,
  onRun,
  handle,
  engine,
  names,
}: {
  value: string
  onChange: (value: string) => void
  onRun: () => void
  handle: React.MutableRefObject<EditorHandle | null>
  engine: DatabaseEngine
  names: string[]
}) {
  const container = useRef<HTMLDivElement>(null),
    editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null),
    change = useRef(onChange),
    run = useRef(onRun),
    sqlNames = useRef(names)
  change.current = onChange
  run.current = onRun
  sqlNames.current = names
  useEffect(() => {
    if (!container.current) return
    const instance = monaco.editor.create(container.current, {
      value,
      language: 'sql',
      minimap: { enabled: false },
      fontSize: 13,
      lineHeight: 22,
      fontFamily: '"SFMono-Regular", Consolas, monospace',
      automaticLayout: true,
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      padding: { top: 16 },
      theme: document.documentElement.classList.contains('dark') ? 'vs-dark' : 'vs',
      ariaLabel: 'SQL editor',
      tabSize: 2,
    })
    editor.current = instance
    const update = instance.onDidChangeModelContent(() => change.current(instance.getValue()))
    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => run.current())
    const completion = monaco.languages.registerCompletionItemProvider('sql', {
      provideCompletionItems(model, position) {
        const word = model.getWordUntilPosition(position),
          range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          }
        return {
          suggestions: [
            ...sqlNames.current,
            ...'SELECT FROM WHERE GROUP BY ORDER BY LIMIT JOIN EXPLAIN SHOW COUNT SUM DISTINCT'.split(' '),
          ].map((label) => ({ label, insertText: label, kind: monaco.languages.CompletionItemKind.Field, range })),
        }
      },
    })
    const observer = new MutationObserver(() =>
      monaco.editor.setTheme(document.documentElement.classList.contains('dark') ? 'vs-dark' : 'vs')
    )
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => {
      update.dispose()
      completion.dispose()
      observer.disconnect()
      instance.dispose()
      editor.current = null
    }
  }, [])
  useEffect(() => {
    const instance = editor.current
    if (instance && instance.getValue() !== value) instance.setValue(value)
  }, [value])
  handle.current = {
    selection: () => {
      const instance = editor.current,
        selection = instance?.getSelection()
      return selection ? instance?.getModel()?.getValueInRange(selection) || '' : ''
    },
    format: () => {
      const instance = editor.current
      if (instance)
        instance.setValue(format(instance.getValue(), { language: engine === 'postgres' ? 'postgresql' : 'mysql' }))
    },
    focus: () => editor.current?.focus(),
  }
  return <div className="sql-editor" ref={container} />
}
