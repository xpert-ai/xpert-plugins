import { mapFile, mapPage, mapQuota, mapSemanticPage, mapUser } from './baidu-netdisk-mapper.js'

describe('Baidu Netdisk response mapper', () => {
  it('maps and bounds file metadata', () => {
    const file = mapFile({
      fs_id: 42,
      path: '/apps/xpert/report.docx',
      server_filename: 'report.docx',
      category: 4,
      isdir: 0,
      size: '12',
      server_mtime: 1_700_000_000,
      content: 'x'.repeat(5_000),
      private_field: 'must not be copied'
    })
    expect(file).toMatchObject({
      fsid: '42',
      path: '/apps/xpert/report.docx',
      name: 'report.docx',
      category: 4,
      isDirectory: false,
      size: 12
    })
    expect(file?.content).toHaveLength(4_000)
    expect(file).not.toHaveProperty('private_field')
  })

  it('bounds page items and calculates continuation', () => {
    const page = mapPage(
      {
        total: 3,
        list: [
          { fs_id: 1, path: '/a', server_filename: 'a', isdir: 1 },
          { fs_id: 2, path: '/b', server_filename: 'b', isdir: 0 },
          { fs_id: 3, path: '/c', server_filename: 'c', isdir: 0 }
        ]
      },
      1,
      2
    )
    expect(page.items).toHaveLength(2)
    expect(page.hasMore).toBe(true)
  })

  it('maps quota and user aliases from Baidu payloads', () => {
    expect(mapQuota({ used: '10', total: 100 })).toEqual({ usedBytes: 10, totalBytes: 100, freeBytes: 90 })
    expect(mapUser({ user_info: { uk: 'u1', uname: 'Ada', avatar_url: 'https://example.com/a' } })).toEqual({
      userId: 'u1',
      name: 'Ada',
      avatarUrl: 'https://example.com/a'
    })
  })

  it('flattens the nested semantic-search response', () => {
    const page = mapSemanticPage(
      {
        is_end: false,
        data: [{ source: 1, list: [{ fsid: 9, path: '/apps/xpert/a.pdf', filename: 'a.pdf', category: 4, isdir: 0 }] }]
      },
      1,
      10
    )
    expect(page.items[0].fsid).toBe('9')
    expect(page.hasMore).toBe(true)
  })
})
