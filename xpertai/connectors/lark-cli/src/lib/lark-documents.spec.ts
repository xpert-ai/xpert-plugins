import axios from 'axios'
import { LarkDocumentSource, larkDocumentLocator } from './lark-documents.js'
import type { ConnectorRuntimeCredentialV2 } from '@xpert-ai/plugin-sdk'
jest.mock('axios', () => ({ __esModule: true, default: { request: jest.fn(), isAxiosError: jest.fn(() => false) } }))
const request = jest.mocked(axios.request)
const credential: ConnectorRuntimeCredentialV2 = {
  connectorId: 'test-connector',
  bindingId: 'test-binding',
  scope: { type: 'project', projectId: 'test-project' },
  authorizationMode: 'personal',
  provider: 'lark',
  authMethodId: 'oauth2',
  credentials: { accessToken: 'private-token', brand: 'feishu' }
}
const id = 'doxcn1234567890'
const metadata = (revision = 5) => ({ data: { code: 0, data: { document: { document_id: id, title: '项目说明', revision_id: revision } } } })
describe('Lark document source', () => {
  beforeEach(() => jest.resetAllMocks())
  it('accepts only typed document locators and strips tracking data without fetching arbitrary hosts', () => {
    expect(larkDocumentLocator(`https://team.feishu.cn/docx/${id}?token=private#part`)).toEqual({ kind: 'docx', id, url: `https://team.feishu.cn/docx/${id}` })
    for (const locator of ['https://feishu.cn.attacker.test/docx/'+id, 'http://team.feishu.cn/docx/'+id, 'https://user:password@team.feishu.cn/docx/'+id, 'https://team.feishu.cn/sheets/'+id, '../'+id, 'https://localhost/docx/'+id]) expect(() => larkDocumentLocator(locator)).toThrow()
  })
  it('lists only explicit docx types and preserves Drive pagination even for a page without documents', async () => {
    request.mockResolvedValueOnce({ data: { code: 0, data: { files: [{ token: id, type: 'sheet', name: '表格' }], has_more: true, next_page_token: 'next' } } })
    expect(await new LarkDocumentSource().search(credential, { query: '', pageSize: 25 })).toEqual({ items: [], nextCursor: 'next' })
    expect(request.mock.calls[0][0]).toMatchObject({ url: 'https://open.feishu.cn/open-apis/drive/v1/files', maxRedirects: 0, params: { page_size: 25 } })
  })
  it('uses keyword search offsets and rejects invalid pagination', async () => {
    request.mockResolvedValueOnce({ data: { code: 0, data: { docs_entities: [{ docs_token: id, docs_type: 'docx', title: '方案' }], has_more: true } } })
    expect((await new LarkDocumentSource().search(credential, { query: '方案', cursor: '25', pageSize: 25 })).nextCursor).toBe('50')
    expect(request.mock.calls[0][0]?.data).toEqual({ search_key: '方案', count: 25, offset: 25, docs_types: ['docx'] })
    await expect(new LarkDocumentSource().search(credential, { query: 'x', cursor: '-1', pageSize: 25 })).rejects.toThrow()
  })
  it('returns a labelled text snapshot only after consistent revision reads', async () => {
    request.mockResolvedValueOnce(metadata()).mockResolvedValueOnce({ data: { code: 0, data: { content: '# 原始文本\n正文' } } }).mockResolvedValueOnce(metadata())
    const result = await new LarkDocumentSource().read(credential, id)
    expect(result).toMatchObject({ id, revision: '5', format: 'text/plain', content: '# 原始文本\n正文', url: null })
    expect(result.warnings).toHaveLength(1); expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/u)
    expect(JSON.stringify(result)).not.toContain('private-token')
  })
  it('rejects concurrent remote revisions, oversized content and sanitized transport failures', async () => {
    request.mockResolvedValueOnce(metadata()).mockResolvedValueOnce({ data: { code: 0, data: { content: 'x' } } }).mockResolvedValueOnce(metadata(6))
    await expect(new LarkDocumentSource().read(credential, id)).rejects.toThrow('source_changed')
    request.mockResolvedValueOnce(metadata()).mockResolvedValueOnce({ data: { code: 0, data: { content: '中'.repeat(40000) } } }).mockResolvedValueOnce(metadata())
    await expect(new LarkDocumentSource().read(credential, id)).rejects.toThrow('too_large')
    request.mockRejectedValueOnce(new Error('private-token'))
    await expect(new LarkDocumentSource().read(credential, id)).rejects.toThrow('lark.documents.request_failed')
  })
  it('resolves wiki nodes by explicit docx type and retains the original public link', async () => {
    const wiki = 'wikcn1234567890', url = `https://team.feishu.cn/wiki/${wiki}`
    const node = { data: { code: 0, data: { node: { node_token: wiki, obj_token: id, obj_type: 'docx' } } } }
    expect(larkDocumentLocator(url + '?from=private#block')).toEqual({ kind: 'wiki', id: wiki, url })
    request.mockResolvedValueOnce(node).mockResolvedValueOnce(metadata())
      .mockResolvedValueOnce({ data: { code: 0, data: { content: '知识库测试正文' } } }).mockResolvedValueOnce(metadata()).mockResolvedValueOnce(node)
    expect(await new LarkDocumentSource().read(credential, url)).toMatchObject({ id, url, content: '知识库测试正文' })
    expect(request.mock.calls[0][0]).toMatchObject({ url: 'https://open.feishu.cn/open-apis/wiki/v2/spaces/node_by_token', params: { token: wiki }, maxRedirects: 0 })
    expect(request.mock.calls[1][0]?.url).toBe(`https://open.feishu.cn/open-apis/docx/v1/documents/${id}`)
    expect(request).toHaveBeenCalledTimes(5)
  })
  it('rejects non-docx, mismatched and retargeted wiki nodes', async () => {
    const wiki = 'wikcn1234567890', url = `https://team.feishu.cn/wiki/${wiki}`
    const node = (obj_type = 'docx', obj_token = id, node_token = wiki) => ({ data: { code: 0, data: { node: { node_token, obj_type, obj_token } } } })
    request.mockResolvedValueOnce(node('sheet'))
    await expect(new LarkDocumentSource().read(credential, url)).rejects.toThrow('unsupported_document_type')
    expect(request).toHaveBeenCalledTimes(1)
    request.mockResolvedValueOnce(node('docx', id, 'another1234567890'))
    await expect(new LarkDocumentSource().read(credential, url)).rejects.toThrow('invalid_response')
    request.mockResolvedValueOnce(node()).mockResolvedValueOnce(metadata())
      .mockResolvedValueOnce({ data: { code: 0, data: { content: 'x' } } }).mockResolvedValueOnce(metadata()).mockResolvedValueOnce(node('docx', 'otherdoc1234567890'))
    await expect(new LarkDocumentSource().read(credential, url)).rejects.toThrow('source_changed')
  })
  it('rejects malformed provider payloads without forwarding their data', async () => {
    request.mockResolvedValueOnce({ data: { code: 0, data: { document: { document_id: id, title: 'private-token', revision_id: '5' } } } })
    await expect(new LarkDocumentSource().read(credential, id)).rejects.toThrow('lark.documents.invalid_response')
  })
  it('distinguishes source ACL denial from an active connection and sanitizes provider errors', async () => {
    request.mockResolvedValueOnce({ data: { code: 131006, msg: 'private-token', data: {} } })
    await expect(new LarkDocumentSource().read(credential, 'https://team.feishu.cn/wiki/wikcn1234567890')).rejects.toThrow('lark.documents.source_access_denied')
    request.mockResolvedValueOnce({ data: { code: 99991672, msg: 'private-token', data: {} } })
    await expect(new LarkDocumentSource().read(credential, id)).rejects.toThrow('lark.documents.provider_rejected:99991672')
  })

})
