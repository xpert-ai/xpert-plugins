import { BaiduNetdiskClient } from './baidu-netdisk.client.js'
import type { BaiduNetdiskOAuthConfig } from '../plugin-config.js'

const config: BaiduNetdiskOAuthConfig = {
  appKey: 'app-key',
  secretKey: 'secret-key',
  authorizationUrl: 'https://openapi.baidu.com/oauth/2.0/authorize',
  tokenUrl: 'https://openapi.baidu.com/oauth/2.0/token',
  apiBaseUrl: 'https://pan.baidu.com',
  uploadBaseUrl: 'https://d.pcs.baidu.com',
  scopes: ['basic', 'netdisk'],
  timeoutMs: 5_000,
  responseMaxBytes: 8_192
}

const credential = { connectorId: 'connector-1', accessToken: 'access-token', tokenType: 'bearer' }

describe('Baidu Netdisk API client', () => {
  afterEach(() => jest.restoreAllMocks())

  it('encodes GET directory and pagination arguments in the query string', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          list: [{ fs_id: 1, path: '/apps/xpert/a.txt', server_filename: 'a.txt', category: 4, isdir: 0 }]
        }),
        { status: 200 }
      )
    )
    const result = await new BaiduNetdiskClient().listFiles(credential, config, {
      path: '/apps/xpert',
      page: 2,
      pageSize: 10,
      category: 'all'
    })
    expect(result.items[0].fsid).toBe('1')
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]))
    expect(requestUrl.searchParams.get('dir')).toBe('/apps/xpert')
    expect(requestUrl.searchParams.get('start')).toBe('10')
    expect(requestUrl.searchParams.get('limit')).toBe('10')
    expect(requestUrl.searchParams.get('access_token')).toBe('access-token')
  })

  it('encodes mutation arguments in a form body', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ errno: 0, taskid: 'task-1' }), { status: 200 }))
    const result = await new BaiduNetdiskClient().fileManager(
      credential,
      config,
      'delete',
      JSON.stringify(['/apps/xpert/a.txt']),
      'fail'
    )
    expect(result).toEqual({ status: 'queued', taskId: 'task-1' })
    const init = fetchMock.mock.calls[0][1]
    expect(init?.method).toBe('POST')
    expect(String(init?.body)).toContain('filelist=%5B%22%2Fapps%2Fxpert%2Fa.txt%22%5D')
    expect(String(init?.body)).toContain('ondup=fail')
  })

  it('uses Baidu UniSearch query parameters and its nested response shape', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ uk: 123 }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            is_end: true,
            data: [{ list: [{ fsid: 7, path: '/apps/xpert/a.pdf', filename: 'a.pdf', category: 4, isdir: 0 }] }]
          }),
          { status: 200 }
        )
      )
    const result = await new BaiduNetdiskClient().semanticSearch(credential, config, {
      query: '项目合同',
      path: '/apps/xpert',
      page: 1,
      pageSize: 10,
      searchType: 2
    })
    expect(result.items[0].name).toBe('a.pdf')
    const searchUrl = new URL(String(fetchMock.mock.calls[1][0]))
    expect(searchUrl.pathname).toBe('/xpan/unisearch')
    expect(searchUrl.searchParams.get('query')).toBe('项目合同')
    expect(searchUrl.searchParams.get('dirs')).toContain('"uk":123')
    expect(fetchMock.mock.calls[1][1]?.body).toBe('{}')
  })

  it('uploads a buffer through precreate, slice upload, and create', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ errno: 0, return_type: 1, uploadid: 'upload-1', block_list: [0] }), {
          status: 200
        })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ errno: 0, md5: 'part-md5' }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ errno: 0, fs_id: 88, path: '/apps/xpert/note.txt', size: 5, md5: 'file-md5' }), {
          status: 200
        })
      )
    const result = await new BaiduNetdiskClient().uploadBuffer(credential, config, {
      path: '/apps/xpert/note.txt',
      buffer: Buffer.from('hello'),
      rtype: 3
    })
    expect(result).toEqual({
      status: 'completed',
      path: '/apps/xpert/note.txt',
      size: 5,
      rapidUpload: false,
      fsid: '88',
      md5: 'file-md5'
    })
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get('method')).toBe('precreate')
    expect(new URL(String(fetchMock.mock.calls[1][0])).host).toBe('d.pcs.baidu.com')
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get('partseq')).toBe('0')
    expect(new URL(String(fetchMock.mock.calls[2][0])).searchParams.get('method')).toBe('create')
  })

  it('returns immediately when Baidu reports rapid upload', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ errno: 0, return_type: 2 }), { status: 200 }))
    const result = await new BaiduNetdiskClient().uploadBuffer(credential, config, {
      path: '/apps/xpert/note.txt',
      buffer: Buffer.from('hello'),
      rtype: 3
    })
    expect(result.rapidUpload).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('normalizes UniSearch error_no responses', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ uk: 123 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error_no: 3, error_msg: 'scope denied' }), { status: 200 }))
    await expect(
      new BaiduNetdiskClient().semanticSearch(credential, config, {
        query: 'x',
        path: '/apps/xpert',
        page: 1,
        pageSize: 10,
        searchType: 2
      })
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
  })
})
