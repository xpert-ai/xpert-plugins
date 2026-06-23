import {
  countSceneFiles,
  isSingleImageMermaidResult
} from './mermaid-conversion-result.js'

describe('isSingleImageMermaidResult', () => {
  it('detects Mermaid image fallback results', () => {
    expect(isSingleImageMermaidResult(
      [{ id: 'image-1', type: 'image', fileId: 'file-1' }],
      { 'file-1': { id: 'file-1', dataURL: 'data:image/svg+xml;base64,abc' } }
    )).toBe(true)
  })

  it('does not treat structured elements as image fallback', () => {
    expect(isSingleImageMermaidResult(
      [
        { id: 'node-1', type: 'rectangle' },
        { id: 'edge-1', type: 'arrow' }
      ],
      {}
    )).toBe(false)
  })

  it('requires a matching file for the image element', () => {
    expect(isSingleImageMermaidResult(
      [{ id: 'image-1', type: 'image', fileId: 'missing-file' }],
      {}
    )).toBe(false)
  })
})

describe('countSceneFiles', () => {
  it('counts scene files by id', () => {
    expect(countSceneFiles({ a: {}, b: {} })).toBe(2)
  })
})
