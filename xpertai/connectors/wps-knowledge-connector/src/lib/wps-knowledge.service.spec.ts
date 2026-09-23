import { WpsKnowledgeService } from './wps-knowledge.service.js'
import type { WpsKnowledgeSkillHubClient } from './wps-knowledge-skillhub.client.js'

describe('WpsKnowledgeService', () => {
  it('maps bounded knowledge-library and file-list responses', async () => {
    const getJson = jest.fn()
      .mockResolvedValueOnce({ code: 0, data: {
        items: [{ kuid: '0s_123', drive_id: 123, name: '制度库', desc: '内部制度', secret: 'drop' }],
        next_page_token: 'next-1'
      } })
      .mockResolvedValueOnce({ code: 0, data: {
        files: [{ kuid: '0l_file', file_id: 456, title: '员工手册', doc_type: 'w', url: 'https://www.kdocs.cn/l/file?signature=drop' }]
      } })
    const service = createService({ getJson })

    const libraries = await service.listLibraries(runtime(), { pageSize: 20 })
    expect(libraries).toEqual({
      items: [{
        kuid: '0s_123',
        driveId: '123',
        name: '制度库',
        description: '内部制度',
        coverUrl: null,
        createdAt: null,
        updatedAt: null
      }],
      nextCursor: 'next-1'
    })
    await expect(service.listFiles(runtime(), { kuid: '0s_123', pageSize: 50 })).resolves.toEqual({
      items: [{
        kuid: '0l_file',
        fileId: '456',
        driveId: null,
        name: '员工手册',
        docType: 'w',
        originType: null,
        folder: false,
        modifiedAt: null,
        linkUrl: 'https://www.kdocs.cn/l/file'
      }],
      nextCursor: null
    })
    expect(JSON.stringify(libraries)).not.toContain('secret')
  })

  it('maps the space fields returned by the WPS knowledge-view list API', async () => {
    const getJson = jest.fn().mockResolvedValue({ code: 0, data: {
      list: [{
        space_kuid: '0s_wps_main',
        drive_id: 789,
        space_name: 'Xpert-WPS-验收-主库-20260826',
        space_desc: '用于连接器验收',
        space_ctime: 1_756_000_000,
        space_utime: '2026-08-26T08:00:00Z',
        internal_secret: 'drop'
      }],
      page_token: 'next-space-page'
    } })
    const service = createService({ getJson })

    await expect(service.listLibraries(runtime(), { keyword: 'Xpert-WPS-验收', pageSize: 2 })).resolves.toEqual({
      items: [{
        kuid: '0s_wps_main',
        driveId: '789',
        name: 'Xpert-WPS-验收-主库-20260826',
        description: '用于连接器验收',
        coverUrl: null,
        createdAt: '2025-08-24T01:46:40.000Z',
        updatedAt: '2026-08-26T08:00:00.000Z'
      }],
      nextCursor: 'next-space-page'
    })
    expect(JSON.stringify(await service.listLibraries(runtime(), { pageSize: 2 }))).not.toContain('internal_secret')
  })

  it('aggregates SkillHub answer deltas and allowlisted citations', async () => {
    const postSse = jest.fn().mockResolvedValue(events([
      { data: JSON.stringify({ code: 0, data: { request_id: 'request-1', answer_citations: [{
        text: '这是',
        reply_sources: [{ kuid: '0l_source', title: '员工手册', url: 'https://www.kdocs.cn/l/source?signature=drop', content: '摘要' }]
      }] } }) },
      { data: JSON.stringify({ code: 0, data: { answer_citations: [{ text: '答案。' }] } }) }
    ]))
    const service = createService({ postSse })

    const result = await service.ask(runtime(), {
      query: '休假制度是什么？',
      libraryKuids: ['0s_123'],
      webSearch: false,
      switchThinking: false
    })

    expect(result).toEqual({
      status: 'completed',
      answer: '这是答案。',
      requestId: 'request-1',
      citations: [{
        kuid: '0l_source',
        fileId: null,
        title: '员工手册',
        sourceUrl: 'https://www.kdocs.cn/l/source',
        snippet: '摘要'
      }],
      truncated: false
    })
    expect(postSse).toHaveBeenCalledWith(
      { accessToken: 'kwiki-token' },
      'knowledge_view/ask',
      {
        input: '休假制度是什么？',
        kuids: ['0s_123'],
        use_web_search: false,
        switch_thinking: false
      }
    )
  })

  it('uses the documented all_wiki scope when no library is selected', async () => {
    const postSse = jest.fn().mockResolvedValue(events([]))
    const service = createService({ postSse })
    await service.ask(runtime(), { query: '问题', webSearch: true, switchThinking: true })
    expect(postSse).toHaveBeenCalledWith(expect.anything(), 'knowledge_view/ask', {
      input: '问题',
      scope: 'all_wiki',
      use_web_search: true,
      switch_thinking: true
    })
  })
})

function createService(client: {
  getJson?: jest.Mock
  postSse?: jest.Mock
}) {
  return new WpsKnowledgeService({
    getJson: client.getJson ?? jest.fn(),
    postSse: client.postSse ?? jest.fn()
  } as unknown as WpsKnowledgeSkillHubClient)
}

async function* events(values: Array<{ data: string }>) {
  for (const value of values) yield { event: 'message', ...value }
}

function runtime() {
  return { credential: { accessToken: 'kwiki-token' } }
}
