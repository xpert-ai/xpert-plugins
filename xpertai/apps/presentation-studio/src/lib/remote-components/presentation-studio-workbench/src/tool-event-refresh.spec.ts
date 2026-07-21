import { normalizePresentationToolEvent } from './tool-event-refresh'

describe('Presentation Studio tool event refresh', () => {
  it('normalizes Remote Component host-event wrappers and component output', () => {
    expect(normalizePresentationToolEvent({
      type: 'hostEvent',
      event: {
        id: 'assistant.tool.completed:call-1',
        type: 'assistant.tool.completed',
        toolName: 'presentation_add_slide',
        data: { output: '{"deckId":"deck-1","slideId":"slide-2"}' }
      }
    })).toEqual({
      toolName: 'presentation_add_slide',
      deckId: 'deck-1',
      slideId: 'slide-2',
      eventKey: 'id:assistant.tool.completed:call-1'
    })
  })

  it('extracts ids from lifecycle args previews', () => {
    expect(normalizePresentationToolEvent({
      type: 'hostEvent',
      event: {
        toolName: 'presentation_add_slide',
        data: { argsPreview: '{"deckId":"deck-2","layout":"theme01_page001"}' }
      }
    })).toMatchObject({ toolName: 'presentation_add_slide', deckId: 'deck-2' })
  })

  it('extracts ids from truncated JSON previews', () => {
    expect(normalizePresentationToolEvent({
      toolName: 'presentation_patch_slide',
      data: { argsPreview: '{"deckId":"deck-3","slideId":"slide-3","propsPatch":{"title":"Long...' }
    })).toMatchObject({
      toolName: 'presentation_patch_slide',
      deckId: 'deck-3',
      slideId: 'slide-3'
    })
  })

  it('normalizes nested tool-call function names', () => {
    expect(normalizePresentationToolEvent({
      toolCall: {
        function: { name: 'presentation_create_deck' },
        arguments: '{"title":"Empty presentation"}'
      }
    })).toEqual({
      toolName: 'presentation_create_deck',
      deckId: undefined,
      slideId: undefined,
      eventKey: undefined
    })
  })

  it('ignores read-only layout inspection events', () => {
    expect(normalizePresentationToolEvent({
      toolName: 'presentation_inspect_layouts',
      data: { output: { layouts: ['theme01_page001'] } }
    })).toBeNull()
  })

  it('normalizes custom-theme lifecycle mutations for theme-list refresh', () => {
    expect(normalizePresentationToolEvent({
      toolName: 'presentation_register_theme',
      data: { output: { theme: { id: 'theme-record-1', key: 'theme15', status: 'ready' } } }
    })).toMatchObject({ toolName: 'presentation_register_theme' })
  })
})
