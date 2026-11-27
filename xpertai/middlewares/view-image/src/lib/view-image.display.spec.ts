import { viewImageDisplay, viewImagePresentation } from './view-image.display.js'

describe('view image display declarations', () => {
  it('declares image viewing independently of its title and exposes only image attachments', () => {
    expect(viewImageDisplay.activity).toEqual({ kind: 'image', action: 'view' })
    expect(viewImagePresentation.attachments).toBe('images')
    expect(viewImagePresentation.input({ path: 'images/chart.png' })).toEqual({ path: 'images/chart.png' })
    expect(viewImagePresentation.input({ path: 'images/chart.png', token: 'private' })).toBeUndefined()
  })
  it('formats concise targets without leaking workspace root prefixes', () => {
    expect(viewImageDisplay.target({ path: '/workspace/project/images/chart.png' })).toBe('images/chart.png')
    expect(viewImageDisplay.target({ paths: ['images/a.png', 'images/b.png'] })).toBe('images/a.png, images/b.png')
  })

  it('includes both aliases and expands compatibility arrays with execution ordering and deduplication', () => {
    expect(viewImageDisplay.target({
      path: JSON.stringify([' /workspace/images/a.png ', '/workspace/images/b.png']),
      paths: ['/workspace/images/b.png', '/workspace/images/c.png']
    })).toBe('images/a.png, images/b.png, images/c.png')
    expect(viewImageDisplay.target({ path: 'images/a.png', paths: 'images/b.png' })).toBe('images/a.png, images/b.png')
  })

  it.each([
    { path: "['invalid.png']" },
    { path: '[1]' },
    { path: '[]' },
    { path: ['a.png', 'b.png'], paths: ['c.png', 'd.png'] },
    { path: 'images/a.png', token: 'private' }
  ])('omits a misleading target for invalid input: %j', (input) => {
    expect(viewImageDisplay.target(input)).toBeUndefined()
  })
})
