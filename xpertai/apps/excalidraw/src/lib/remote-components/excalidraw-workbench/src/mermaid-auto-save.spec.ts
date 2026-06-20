import {
  beginMermaidAutoSave,
  createMermaidAutoSaveGuard,
  createMermaidAutoSaveKey,
  finishMermaidAutoSave
} from './mermaid-auto-save.js'

describe('Mermaid auto-save guard', () => {
  it('allows one auto-save per source version and Mermaid source', () => {
    const guard = createMermaidAutoSaveGuard()
    const key = createMermaidAutoSaveKey('version-1', 'flowchart TD\nA-->B')

    expect(beginMermaidAutoSave(guard, key)).toBe(true)
    expect(beginMermaidAutoSave(guard, key)).toBe(false)

    finishMermaidAutoSave(guard, key, true)

    expect(beginMermaidAutoSave(guard, key)).toBe(false)
  })

  it('allows retry after a failed save', () => {
    const guard = createMermaidAutoSaveGuard()
    const key = createMermaidAutoSaveKey('version-1', 'flowchart TD\nA-->B')

    expect(beginMermaidAutoSave(guard, key)).toBe(true)
    finishMermaidAutoSave(guard, key, false)

    expect(beginMermaidAutoSave(guard, key)).toBe(true)
  })

  it('normalizes CRLF line endings for stable keys', () => {
    expect(createMermaidAutoSaveKey('version-1', 'flowchart TD\r\nA-->B')).toBe(
      createMermaidAutoSaveKey('version-1', 'flowchart TD\nA-->B')
    )
  })
})
