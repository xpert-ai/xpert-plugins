import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { test } from 'node:test'
import React from 'react'
import { transformSync } from 'esbuild'
import { defaultPolicy, type PolicySettings } from '../src/automation-contract.js'

test('switching PR modes preserves workflow choices and keeps diagnosis controls available', () => {
  const module = { exports: {} as typeof import('../remote-components/code-review/src/event-settings.js') }
  const source = readFileSync(new URL('../remote-components/code-review/src/event-settings.tsx', import.meta.url), 'utf8')
  runInNewContext(transformSync(source, { loader: 'tsx', format: 'cjs' }).code, {
    module, exports: module.exports,
    require(id: string) {
      if (id === 'react') return React
      if (id === '@xpert-ai/plugin-shadcn-ui') return Object.fromEntries(['Checkbox', 'Select', 'SelectTrigger', 'SelectValue', 'SelectContent', 'SelectItem', 'Textarea'].map(key => [key, key]))
      if (id === '@xpert-ai/plugin-shadcn-ui/i18n') return { RemoteI18nProvider: 'Provider' }
      if (id === './event-i18n') return { eventI18n: { t: (key: string) => key } }
      throw new Error(`Unexpected import: ${id}`)
    }
  })
  type Props = { children?: React.ReactNode; value?: unknown; checked?: boolean; onValueChange?: (value: string) => void }
  function nodes(node: React.ReactNode): React.ReactElement<Props>[] {
    if (Array.isArray(node)) return node.flatMap(nodes)
    if (!React.isValidElement<Props>(node)) return []
    return [node, ...nodes(node.props.children)]
  }
  let settings: PolicySettings = { ...defaultPolicy, onWorkflowFailure: true, onWorkflowTimeout: true, workflows: ['CI'] }
  for (const next of ['pipeline', 'assistant', 'pipeline']) {
    const tree = nodes(module.exports.EventSettings({ settings, onChange: patch => { settings = { ...settings, ...patch } } }))
    assert.equal(tree.filter(node => node.type === 'Checkbox' && node.props.checked).length, 2)
    assert.equal(tree.find(node => node.type === 'Textarea')?.props.value, 'CI')
    tree.find(node => node.type === 'Select')!.props.onValueChange!(next)
    assert.equal(settings.executionMode, next)
    assert.equal(settings.onWorkflowFailure, true)
    assert.equal(settings.onWorkflowTimeout, true)
    assert.deepEqual(settings.workflows, ['CI'])
  }
})
