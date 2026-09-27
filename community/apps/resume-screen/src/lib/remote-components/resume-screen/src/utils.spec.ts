/**
 * 列表合并纯函数的展示层断言（M11「琢」· 高性能渲染 + 流畅动画维）
 *
 * 钉住蓝图 §11「requestData 全量刷新不整列表重渲」与 §7 A8「行移出淡出」的数据侧契约：
 * 内容未变的行必须复用旧引用（memo 短路的前提）；合并结果中保留行顺序必须等于
 * 服务端最终顺序（淡出行只是过渡性插入，提交后不得留下行跳位）。
 */
import { candidateSignature, mergeAppendedPage, mergeRefreshedList, reconcileCandidateItems } from './utils'
import type { CandidateView } from './types'

// 构造最小可用候选人行：只填参与展示签名的字段
function makeCandidate(overrides: Partial<CandidateView> & { id: string }): CandidateView {
  return {
    jobId: 'job-1',
    status: 'pending_review',
    name: `候选人-${overrides.id}`,
    matchScore: 70,
    attemptCount: 1,
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
