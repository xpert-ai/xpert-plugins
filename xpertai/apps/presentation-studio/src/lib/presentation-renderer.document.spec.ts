import { preparePresentationHtmlForExport, sanitizePresentationEditorText } from './presentation-renderer.service.js'

describe('Presentation renderer document modes', () => {
  it('locks distributed HTML to presentation mode without editor chrome', () => {
    const html = '<!doctype html><html><head></head><body class="deck"><main id="deck"></main></body></html>'
    const exported = preparePresentationHtmlForExport(html)

    expect(exported).toContain('<body class="deck" data-mode="present" data-presentation-export="true">')
    expect(exported).toContain('id="xpert-presentation-export-style"')
    expect(exported).toContain('body[data-presentation-export="true"] #deck-topbar')
    expect(exported).toContain('id="xpert-presentation-export-guard"')
  })

  it('normalizes editor rich-text markup to safe plain text before rendering', () => {
    expect(sanitizePresentationEditorText({ title: '<span>Annual &amp; Review</span><br>2026', note: 'plain text' })).toEqual({
      title: 'Annual & Review\n2026', note: 'plain text'
    })
  })
})
