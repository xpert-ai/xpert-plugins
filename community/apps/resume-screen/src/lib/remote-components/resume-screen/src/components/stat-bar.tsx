/**
 * 统计条（蓝图 §3.3：sm .sm-stat-pill 胶囊；pill 即状态筛选器，与左列表同源联动）
 *
 * 「共 N」固定左侧、不参与筛选；状态 pill 顺序固定（待审→推进→待定→淘汰→失败→解析中）
 * 保证位置记忆，为 0 仍显示（数值置灰）；选中 pill 反转填充（软底→强色底白字，160ms，A14）；
 * 解析中 pill 在存在超时条目时数值旁加琥珀点（§6.4）。
 */
import React from '../react-shim'
import { Skeleton } from '@xpert-ai/plugin-shadcn-ui'
import type { StatusFilter, ViewStats } from '../types'

const { useMemo } = React

interface StatBarProps {
  stats: ViewStats
  // 首屏骨架（§6.1：统计条灰条），数据到达后替换为真实 pill
  loading: boolean
  value: StatusFilter
  hasTimedOutParsing: boolean
  onFilterChange: (value: StatusFilter) => void
}

// pill 定义：值、文案、计数键与强色（A14 反转底色用）——色对同源蓝图 §5.1
const PILL_DEFS: Array<{ key: StatusFilter; label: string; pick: (stats: ViewStats) => number; accent: string }> = [
  { key: 'pending_review', label: '待审', pick: (s) => s.pendingReview, accent: 'var(--rs-blue)' },
  { key: 'accepted', label: '推进', pick: (s) => s.accepted, accent: 'var(--rs-green)' },
  { key: 'hold', label: '待定', pick: (s) => s.hold, accent: 'var(--rs-amber)' },
  { key: 'rejected', label: '淘汰', pick: (s) => s.rejected, accent: 'var(--rs-red)' },
  { key: 'failed', label: '失败', pick: (s) => s.failed, accent: 'var(--rs-red)' },
  { key: 'parsing', label: '解析中', pick: (s) => s.parsing, accent: 'var(--rs-blue)' }
]

export function StatBar({ stats, loading, value, hasTimedOutParsing, onFilterChange }: StatBarProps) {
  const pills = useMemo(
    () => PILL_DEFS.map((def) => ({ def, count: def.pick(stats) })),
    [stats]
  )
  if (loading) {
    // 首屏统计条骨架：与 pill 同规格灰条，防 CLS（§6.1）
    return (
      <nav className="rs-statsbar" aria-label="状态统计加载中" aria-busy="true">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="rs-pill-skeleton" />
        ))}
      </nav>
    )
  }
  return (
    <nav className="rs-statsbar" aria-label="状态统计筛选">
      <span className="rs-pill rs-pill-total">
        <strong>{stats.total}</strong>
        共
      </span>
      {pills.map(({ def, count }) => {
        const selected = value === def.key
        return (
          <button
            key={def.key}
            type="button"
            className={`rs-pill${count === 0 ? ' is-zero' : ''}${selected ? ' is-selected' : ''}`}
            // 选中反转底色 = 该状态强色（A14，160ms 过渡定义在 .rs-pill 基础样式）
            style={{ '--pill-strong': def.accent } as React.CSSProperties}
            aria-pressed={selected}
            onClick={() => onFilterChange(selected ? 'all' : def.key)}
          >
            {count}
            <span>{def.label}</span>
            {def.key === 'parsing' && count > 0 ? <i className="ri-loader-4-line rs-spin" aria-hidden="true" /> : null}
            {def.key === 'parsing' && hasTimedOutParsing ? <span className="rs-timeout-dot" aria-label="存在解析超时" /> : null}
          </button>
        )
      })}
    </nav>
  )
}
