import { unwrapRemoteResponse } from './response-data'

describe('Presentation Studio remote response data', () => {
  it('keeps a deck detail item together with its collection siblings', () => {
    const detail = {
      item: { deckId: 'deck-1', title: 'Annual review' },
      versions: [{ id: 'version-1' }],
      exports: [{ exportId: 'export-1' }],
      assets: []
    }

    expect(unwrapRemoteResponse({ payload: detail })).toEqual(detail)
  })

  it('unwraps action result data without treating domain item fields as envelopes', () => {
    const detail = {
      item: { deckId: 'deck-1', title: 'Annual review' },
      versions: [],
      exports: [],
      assets: []
    }

    expect(unwrapRemoteResponse({ payload: { success: true, data: detail } })).toEqual(detail)
  })
})
