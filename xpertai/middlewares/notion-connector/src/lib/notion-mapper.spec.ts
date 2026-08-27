import { blocksToMarkdown, mapDataSource, mapPageDetail, mapPageSummary } from './notion-mapper.js'

describe('Notion mappers', () => {
  it('maps page title and properties to an allowlisted DTO', () => {
    expect(
      mapPageDetail({
        object: 'page',
        id: 'page-1',
        url: 'https://notion.so/page-1',
        last_edited_time: '2026-08-26T00:00:00.000Z',
        properties: {
          Name: { type: 'title', title: [{ plain_text: 'Project plan' }] },
          Done: { type: 'checkbox', checkbox: true },
          Secret: { type: 'unsupported', unsupported: { token: 'must-not-leak' } }
        }
      })
    ).toEqual(
      expect.objectContaining({
        id: 'page-1',
        title: 'Project plan',
        properties: { Name: 'Project plan', Done: true, Secret: null }
      })
    )
  })

  it('maps data source schemas and renders nested block markdown', () => {
    expect(
      mapDataSource({
        object: 'data_source',
        id: 'ds-1',
        title: [{ plain_text: 'Tasks' }],
        properties: { Name: { type: 'title' }, Status: { type: 'status' } }
      })
    ).toEqual({
      id: 'ds-1',
      type: 'data_source',
      title: 'Tasks',
      properties: { Name: 'title', Status: 'status' }
    })
    expect(
      blocksToMarkdown([
        { id: '1', type: 'heading_1', text: 'Overview', hasChildren: false },
        {
          id: '2',
          type: 'bulleted_list_item',
          text: 'First',
          hasChildren: true,
          children: [{ id: '3', type: 'paragraph', text: 'Detail', hasChildren: false }]
        }
      ])
    ).toContain('# Overview\n\n- First\n  Detail')
  })

  it('does not invent a title for an object without title text', () => {
    expect(mapPageSummary({ object: 'page', id: 'page-2', properties: {} }).title).toBeUndefined()
  })
})
