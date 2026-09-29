/**
 * 列表合并纯函数的展示层断言（M11「琢」· 高性能渲染 + 流畅动画维）
 *
 * 钉住蓝图 §11「requestData 全量刷新不整列表重渲」与 §7 A8「行移出淡出」的数据侧契约：
 * 内容未变的行必须复用旧引用（memo 短路的前提）；合并结果中保留行顺序必须等于
 * 服务端最终顺序（淡出行只是过渡性插入，提交后不得留下行跳位）。
 */
import {
  UPLOAD_OVERSIZE_HINT,
  candidateSignature,
  createPdfBlobUrl,
  decodeBase64ToBytes,
  looksLikeRevisionConflict,
  mapUploadFailure,
  mergeAppendedPage,
  mergeRefreshedList,
  reconcileCandidateItems,
  summarizeUploadRows
} from './utils'
import type { CandidateView, UploadRow } from './types'

// 构造最小可用候选人行：只填参与展示签名的字段
function makeCandidate(overrides: Partial<CandidateView> & { id: string }): CandidateView {
  return {
    jobId: 'job-1',
    status: 'pending_review',
    name: `候选人-${overrides.id}`,
    matchScore: 70,
    attemptCount: 1,
    hasFile: true,
    revision: 1,
    createdAt: '2026-09-27T08:00:00.000Z',
    updatedAt: '2026-09-27T08:00:00.000Z',
    ...overrides
  }
}

describe('reconcileCandidateItems · 静默刷新引用稳定', () => {
  it('两轮心跳内容完全一致的行复用旧引用，memo 行组件得以整体跳过重渲', () => {
    const previous = [makeCandidate({ id: 'a' }), makeCandidate({ id: 'b' })]
    const next = [makeCandidate({ id: 'a' }), makeCandidate({ id: 'b' })]
    const merged = reconcileCandidateItems(previous, next)
    expect(merged[0]).toBe(previous[0])
    expect(merged[1]).toBe(previous[1])
  })

  it('解析中回填为待审的行（内容变化）必须返回新引用以触发重渲与评分呈现', () => {
    const previous = [makeCandidate({ id: 'a', status: 'parsing', matchScore: undefined })]
    const next = [makeCandidate({ id: 'a', status: 'pending_review', matchScore: 86 })]
    const merged = reconcileCandidateItems(previous, next)
    expect(merged[0]).toBe(next[0])
    expect(merged[0].matchScore).toBe(86)
  })

  it('顺序以服务端结果为准；previous 缺席的新行按新引用入场', () => {
    const previous = [makeCandidate({ id: 'a' }), makeCandidate({ id: 'b' })]
    const next = [makeCandidate({ id: 'b' }), makeCandidate({ id: 'c' })]
    const merged = reconcileCandidateItems(previous, next)
    expect(merged.map((item) => item.id)).toEqual(['b', 'c'])
    expect(merged[0]).toBe(previous[1])
    expect(merged[1]).toBe(next[1])
  })

  it('淡出副本不得被复用为旧引用，防止服务端复活的行继承 leaving 标记', () => {
    const fading = { ...makeCandidate({ id: 'a' }), leaving: true }
    const next = [makeCandidate({ id: 'a' })]
    const merged = reconcileCandidateItems([fading], next)
    expect(merged[0]).toBe(next[0])
    expect(merged[0].leaving).toBeUndefined()
  })
})

describe('mergeRefreshedList · A8 行移出淡出数据契约', () => {
  it('状态筛选移除行时挂 leaving 副本入渲染列表，保留行已处于最终顺序', () => {
    const previous = [makeCandidate({ id: 'a' }), makeCandidate({ id: 'b' }), makeCandidate({ id: 'c' })]
    const next = [makeCandidate({ id: 'a' }), makeCandidate({ id: 'c' })]
    const rows = mergeRefreshedList(previous, next)
    expect(rows.map((row) => row.id)).toEqual(['a', 'b', 'c'])
    expect(rows[1].leaving).toBe(true)
    // 排除淡出行后必须已是最终（next）顺序：180ms 提交后其余行零位移
    expect(rows.filter((row) => !row.leaving).map((row) => row.id)).toEqual(['a', 'c'])
  })

  it('无移除的刷新（心跳常态）结果不含任何 leaving 行且沿用旧引用', () => {
    const previous = [makeCandidate({ id: 'a' }), makeCandidate({ id: 'b' })]
    const next = [makeCandidate({ id: 'a' }), makeCandidate({ id: 'b' }), makeCandidate({ id: 'c' })]
    const rows = mergeRefreshedList(previous, next)
    expect(rows.every((row) => !row.leaving)).toBe(true)
    expect(rows[0]).toBe(previous[0])
    expect(rows[1]).toBe(previous[1])
  })

  it('连续刷新窗口内，上一轮淡出行继续携带而不被重复标记', () => {
    const fading = { ...makeCandidate({ id: 'x' }), leaving: true }
    const previous = [fading, makeCandidate({ id: 'a' })]
    const next = [makeCandidate({ id: 'a' })]
    const rows = mergeRefreshedList(previous, next)
    expect(rows.filter((row) => row.id === 'x')).toHaveLength(1)
    expect(rows.find((row) => row.id === 'x')?.leaving).toBe(true)
  })

  it('淡出行插在其旧序邻行之后，保持消失前的视觉位置', () => {
    const previous = [makeCandidate({ id: 'a' }), makeCandidate({ id: 'b' }), makeCandidate({ id: 'c' }), makeCandidate({ id: 'd' })]
    const next = [makeCandidate({ id: 'a' }), makeCandidate({ id: 'c' }), makeCandidate({ id: 'd' })]
    const rows = mergeRefreshedList(previous, next)
    const positions = rows.map((row) => row.id)
    expect(positions.indexOf('b')).toBeGreaterThan(positions.indexOf('a'))
    expect(positions.indexOf('b')).toBeLessThan(positions.indexOf('c'))
  })
})

describe('mergeAppendedPage · 加载更多与淡出窗口交叠竞态（I-2）', () => {
  it('加载更多回执落在淡出窗口内：以存活行为基底并入第 2 页，淡出行即时净化无幽灵行滞留', () => {
    // previous 模拟「筛选刷新已开淡出窗口」的渲染列表：b 为在途 leaving 副本
    const fading = { ...makeCandidate({ id: 'b' }), leaving: true }
    const previous = [makeCandidate({ id: 'a' }), fading, makeCandidate({ id: 'c' })]
    const pageTwo = [makeCandidate({ id: 'd' }), makeCandidate({ id: 'e' })]
    const rows = mergeAppendedPage(previous, pageTwo)
    // 业务结果钉死：第 2 页数据完整在场，且列表不残留任何 opacity:0 占 DOM 的 leaving 行
    // （在途淡出窗口由调用方令牌递增作废后，此处即为唯一收尸路径）
    expect(rows.map((row) => row.id)).toEqual(['a', 'c', 'd', 'e'])
    expect(rows.some((row) => row.leaving)).toBe(false)
  })

  it('加载更多回显列表已有 id（分页边界漂移）：不重复追加，且在场存活行沿用旧引用', () => {
    const previous = [makeCandidate({ id: 'a' }), makeCandidate({ id: 'b' })]
    const pageTwo = [makeCandidate({ id: 'b' }), makeCandidate({ id: 'c' })]
    const rows = mergeAppendedPage(previous, pageTwo)
    expect(rows.map((row) => row.id)).toEqual(['a', 'b', 'c'])
    // 未变化行引用原样保留：追加分页轮次不得击穿 memo 造成整列表重渲（§11）
    expect(rows[0]).toBe(previous[0])
    expect(rows[1]).toBe(previous[1])
  })
})

describe('candidateSignature · 展示字段覆盖', () => {
  it('技能数组逐项参与签名：任一元素变化即判定为内容变化（触发重渲）', () => {
    const base = makeCandidate({ id: 'a', skills: ['React'] })
    const changed = makeCandidate({ id: 'a', skills: ['React', 'Vue'] })
    const same = makeCandidate({ id: 'a', skills: ['React'] })
    expect(candidateSignature(base)).not.toBe(candidateSignature(changed))
    expect(candidateSignature(base)).toBe(candidateSignature(same))
  })
})

describe('looksLikeRevisionConflict · 冲突判定以回执 code 为先（S7 审核 F5）', () => {
  it('回执携带 revision_conflict code 时直接判定冲突，不依赖 message 文案', () => {
    // message 完全不含冲突字样也须命中：证明判据是结构化 code 而不是 localized copy
    expect(looksLikeRevisionConflict('save rejected', 'revision_conflict')).toBe(true)
  })

  it('无 code（旧服务端）时回退中文文案正则兜底', () => {
    expect(looksLikeRevisionConflict('记录已被他人修改，请刷新')).toBe(true)
    expect(looksLikeRevisionConflict('matchScore 必须是 0-100 的整数', undefined)).toBe(false)
  })
})

// 上传弹窗行工厂：默认字段给最小合法值，三类场景（进行中/全终态/淡出残影）各覆盖一份
function uploadRow(status: UploadRow['status'], overrides: Partial<UploadRow> = {}): UploadRow {
  return { localId: 1, fileName: '张三.pdf', status, startedAt: 1_700_000_000_000, ...overrides }
}

describe('summarizeUploadRows · 弹窗汇总与可关闭判定（spec §5.3）', () => {
  it('五态各一行：计数正确且有进行中即不可关闭', () => {
    const rows = [uploadRow('queued'), uploadRow('uploading'), uploadRow('created'), uploadRow('skipped'), uploadRow('failed')]
    expect(summarizeUploadRows(rows)).toEqual({ selected: 5, done: 1, skipped: 1, failed: 1, inFlight: 2, closable: false })
  })

  it('全部终态即可关闭；空列表也判可关闭（弹窗不许把自己锁死）', () => {
    expect(summarizeUploadRows([uploadRow('created'), uploadRow('failed')]).closable).toBe(true)
    expect(summarizeUploadRows([])).toEqual({ selected: 0, done: 0, skipped: 0, failed: 0, inFlight: 0, closable: true })
  })

  it('淡出中的失败行（清除记录 160ms 窗口）不参与计数，汇总条不出现幽灵数', () => {
    const rows = [uploadRow('failed', { leaving: true }), uploadRow('created')]
    expect(summarizeUploadRows(rows)).toMatchObject({ selected: 1, failed: 0, inFlight: 0, closable: true })
  })
})

describe('mapUploadFailure · 服务端 reason token 优先（spec §6.4/§6.6）', () => {
  it('file_missing 与重试失败文案同源（旧数据未保留文件）', () => {
    expect(mapUploadFailure('file_missing')).toBe('该候选人未保留原始简历文件，无法重新解析，请重新上传该简历')
  })

  // token 命中即返回固定指引：processor 的 failureReason 就是这些机器可读原值（T11）
  it.each([
    ['no_text_layer', '该 PDF 无法提取文字（可能为扫描件），请转存为 Word 后重新上传'],
    ['encrypted', '文件已加密，请解除密码后重新上传'],
    ['unsupported_format', '仅支持 .docx / .pdf（≤10MB），请转换格式后重新上传'],
    ['file_too_large', UPLOAD_OVERSIZE_HINT],
    ['parse_error', '文件内容无法解析，请确认文件未损坏后重新上传']
  ] as const)('%s → 固定可执行指引', (token, copy) => {
    expect(mapUploadFailure(token)).toBe(copy)
  })

  it('旧服务端的中文 message 通道不回归：未知 token 原样透出', () => {
    expect(mapUploadFailure('请先选择岗位再上传简历')).toBe('请先选择岗位再上传简历')
    expect(mapUploadFailure('')).toBe('上传失败，请重新上传')
  })
})

describe('decodeBase64ToBytes · pdf 回执解码', () => {
  it('还原含 +/ 与填充位的字节序列（Blob URL 分支的前提）', () => {
    const bytes = decodeBase64ToBytes(Buffer.from('%PDF-1.7\nÊ½ñ¶\n').toString('base64'))
    expect(Array.from(bytes.slice(0, 8))).toEqual([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])
  })

  it('空串返回零长度数组（渲染层据此走失败提示，不抛）', () => {
    expect(decodeBase64ToBytes('')).toHaveLength(0)
  })

  it('非法 base64 抛可读错误，交由弹窗落 notice', () => {
    expect(() => decodeBase64ToBytes('!!!not base64!!!')).toThrow()
  })
})

describe('createPdfBlobUrl · 创建与释放必须成对（spec §5.8 泄漏红线）', () => {
  const created: string[] = []
  const revoked: string[] = []
  let originalUrl: typeof globalThis.URL

  beforeEach(() => {
    created.length = 0
    revoked.length = 0
    originalUrl = globalThis.URL
    // iframe 侧才真有 Blob URL；node 环境按同构接口桩住，断言点在调用次序而非浏览器实现
    const stub = {
      createObjectURL: () => {
        const url = `blob:mock/${created.length}`
        created.push(url)
        return url
      },
      revokeObjectURL: (url: string) => void revoked.push(url)
    }
    globalThis.URL = Object.assign(function URL() {}, stub) as unknown as typeof globalThis.URL
  })
  afterEach(() => {
    globalThis.URL = originalUrl
  })

  it('创建后不立即释放（pdf 正在被查看），且 release 恰好释放一次', () => {
    const handle = createPdfBlobUrl(new Uint8Array([1, 2, 3]), 'application/pdf')
    expect(handle.url).toBe('blob:mock/0')
    expect(revoked).toEqual([])
    handle.release()
    expect(revoked).toEqual(['blob:mock/0'])
  })

  // effect cleanup 与「关闭弹窗」两条路径都会调 release：必须幂等，否则重复 revoke 掩盖真实泄漏计数
  it('release 重复调用只释放一次', () => {
    const handle = createPdfBlobUrl(new Uint8Array([1]), 'application/pdf')
    handle.release()
    handle.release()
    handle.release()
    expect(revoked).toEqual(['blob:mock/0'])
  })

  it('创建即抛错时原样上抛，且不产生任何释放调用（没有孤儿 URL 可释放）', () => {
    globalThis.URL = Object.assign(function URL() {}, {
      createObjectURL: () => {
        throw new Error('blob boom')
      },
      revokeObjectURL: (url: string) => void revoked.push(url)
    }) as unknown as typeof globalThis.URL
    expect(() => createPdfBlobUrl(new Uint8Array([1]), 'application/pdf')).toThrow('blob boom')
    expect(revoked).toEqual([])
  })
})
