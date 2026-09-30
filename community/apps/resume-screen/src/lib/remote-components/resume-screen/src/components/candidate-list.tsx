/**
 * 左列表区（蓝图 §3.4：搜索 + 状态筛选 + 排序 + 双行列表卡 + 分页）
 *
 * 列表行 memo（props：候选人引用 + 选中/超时/进场派生布尔，§11 性能约束）；
 * 键盘 ↑/↓ 移动选中并 scrollIntoView；首屏 6 行 Skeleton；两种空态文案与 CTA。
 * 匹配分呈现走 P2 裁决：Badge（tabular-nums）+ Progress 细条，不引第三方图表。
 */
import React from '../react-shim'
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@xpert-ai/plugin-shadcn-ui'
import { CandidateBadge, statusAccent } from './badges'
import type { CandidateView, SortBy, SortDir, StatusFilter } from '../types'
import { DOM_ROW_CAP, formatMonthDay, scoreTier } from '../utils'

const { memo, useEffect, useRef, useState } = React

// 排序菜单五选项：完全复刻 crm 排序菜单结构，映射 sortBy+sortDir（§3.4）
const SORT_OPTIONS: Array<{ value: string; label: string; by: SortBy; dir: SortDir }> = [
  { value: 'matchScore:desc', label: '匹配分降序', by: 'matchScore', dir: 'desc' },
  { value: 'matchScore:asc', label: '匹配分升序', by: 'matchScore', dir: 'asc' },
  { value: 'createdAt:desc', label: '创建时间降序', by: 'createdAt', dir: 'desc' },
  { value: 'createdAt:asc', label: '创建时间升序', by: 'createdAt', dir: 'asc' },
  { value: 'updatedAt:desc', label: '更新时间降序', by: 'updatedAt', dir: 'desc' }
]

// 状态筛选与统计 pill 同源枚举（§3.4）
const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'pending_review', label: '待审' },
  { value: 'accepted', label: '推进' },
  { value: 'hold', label: '待定' },
  { value: 'rejected', label: '淘汰' },
  { value: 'failed', label: '失败' },
  { value: 'parsing', label: '解析中' }
]

interface CandidateListProps {
  loading: boolean
  items: CandidateView[]
  total: number
  selectedId: string | null
  search: string
  status: StatusFilter
  sortBy: SortBy
  sortDir: SortDir
  // A7 进场行 id 集合（仅数据真实新增时非空，§7 降级纪律）
  enteringIds: Set<string>
  // 超时判定结果由上层 30s 心跳统一重算，行组件只消费布尔派生态（§11）
  isTimedOut: (candidate: CandidateView) => boolean
  hasJobs: boolean
  hasFilterActive: boolean
  onSelect: (id: string) => void
  // 键盘 ↑/↓ 导航：实现在 workbench（列表与抽屉共用同一游标，§5.5），本组件只派发 ±1
  onMoveSelection: (delta: number) => void
  onSearch: (value: string) => void
  onStatusChange: (value: StatusFilter) => void
  onSortChange: (value: string) => void
  onLoadMore: () => void
  onClearFilters: () => void
  onUploadRequest: () => void
  onCreateJobRequest: () => void
  // A15 队列跳转高亮目标（行挂脉冲 class，一次后清除）
  jumpCandidateId: string | null
  onJumpConsumed: () => void
}

export function CandidateList(props: CandidateListProps) {
  const { loading, items, total, selectedId, search, status, sortBy, sortDir, enteringIds } = props
  const listRef = useRef<HTMLDivElement | null>(null)
  const [searchDraft, setSearchDraft] = useState(search)

  // 上层清除筛选/切换岗位时回填草稿（外部变更同步到输入框）
  useEffect(() => {
    setSearchDraft(search)
  }, [search])

  // 选中行滚动跟随（键盘 ↑/↓ 时把选中项带进可视区，§3.4）
  useEffect(() => {
    if (!selectedId || !listRef.current) return
    const node = listRef.current.querySelector(`[data-candidate-id="${CSS.escape(selectedId)}"]`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  // 键盘导航只在存活行间移动：淡出中的行（A8）不可达，防选中一条正在消失的行
  // （选中/导航本身的实现上提至 workbench，这里只保留计数用的存活行口径）
  function liveRows() {
    return items.some((item) => item.leaving) ? items.filter((item) => !item.leaving) : items
  }

  const sortValue = `${sortBy}:${sortDir}`
  const sortLabel = SORT_OPTIONS.find((option) => sortValue === option.value)?.label ?? '匹配分降序'
  // 排序非默认时工具按钮挂 is-active 蓝底高亮（§3.4 crm 工具按钮样式）
  const sortActive = sortValue !== 'matchScore:desc'
  // 计数条与「加载更多」判定不含淡出残影行（shown=真实在列数，items 仍全量渲染）
  const shown = liveRows().length
  const overCap = shown >= DOM_ROW_CAP

  return (
    <>
      <div className="rs-list-tools">
        <label className="rs-search">
          <i className="ri-search-line" aria-hidden="true" />
          <input
            data-slot="input"
            value={searchDraft}
            placeholder="搜索姓名/公司/技能，Enter 提交"
            aria-label="搜索候选人"
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setSearchDraft(event.currentTarget.value)}
            onKeyDown={(event: React.KeyboardEvent) => {
              if (event.key === 'Enter') props.onSearch(searchDraft.trim())
            }}
            // 失焦提交带 300ms debounce（对齐 crm applySearch + 蓝图 Enter 主路径）
            onBlur={() => {
              window.setTimeout(() => props.onSearch(searchDraft.trim()), 300)
            }}
          />
        </label>
        <div className="rs-list-filter">
          <Select value={status} onValueChange={(value) => props.onStatusChange(value as StatusFilter)}>
            <SelectTrigger aria-label="状态筛选" className="rs-status-select">
              <SelectValue />
            </SelectTrigger>
            {/* popper 定位：浮层随触发器对齐、不落宿主滚动容器裁切区（§5.6），8px 碰撞边距；
                强制 side=bottom（T20 E2E 项 10）：blob iframe 内 Radix 碰撞定位曾把浮层翻出视口上方 */}
            <SelectContent position="popper" side="bottom" collisionPadding={8}>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* 上传入口：图标+文字常驻工具条（§5.3）；说明走 Tooltip 而不是 title，约束文案可被发现 */}
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* 可访问名显式声明（T20 E2E 项 3）：不依赖 <span> 文本兜底，读屏/测试均直取 aria-label */}
                <Button variant="outline" size="sm" className="rs-toolbar-button" aria-label="上传简历" onClick={props.onUploadRequest}>
                  <i className="ri-upload-cloud-2-line" aria-hidden="true" />
                  <span className="rs-header-label">上传简历</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" collisionPadding={8}>
                支持 .docx / .pdf，单文件 ≤ 10MB，可多选
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className={`rs-toolbar-button${sortActive ? ' is-active' : ''}`} title="排序">
                <i className="ri-arrow-up-down-line" aria-hidden="true" />
                {sortLabel}
              </Button>
            </DropdownMenuTrigger>
            {/* 强制 side=bottom（T20 E2E 项 10）：blob iframe 内 Radix 碰撞定位曾把菜单翻到
                视口外 y=-344（触发器在工具条顶部，上翻无空间），钉死向下展开避开该异常路径 */}
            <DropdownMenuContent align="end" side="bottom" collisionPadding={8}>
              <DropdownMenuLabel>排序</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={sortValue} onValueChange={props.onSortChange}>
                {SORT_OPTIONS.map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value}>
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {search ? (
          <span className="rs-search-chip">
            <Badge variant="secondary">搜索中「{search}」</Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchDraft('')
                props.onSearch('')
              }}
            >
              <i className="ri-close-line" aria-hidden="true" />
              清除
            </Button>
          </span>
        ) : null}
      </div>

      <div
        className="rs-list"
        ref={listRef}
        role="listbox"
        aria-label="候选人列表"
        aria-busy={loading}
        tabIndex={0}
        onKeyDown={(event: React.KeyboardEvent) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            props.onMoveSelection(1)
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            props.onMoveSelection(-1)
          } else if (event.key === 'Enter' && selectedId) {
            // Enter 与鼠标点行同径（§6.8 键盘可达）：窄容器下即打开 Sheet 详情抽屉
            props.onSelect(selectedId)
          }
        }}
      >
        {loading && shown === 0 ? <ListSkeleton /> : null}
        {/* 空态在 A8 淡出行提交完毕后才登场：防「空态与正在消失的行」并存的观感噪声 */}
        {!loading && shown === 0 && !items.some((item) => item.leaving) ? <EmptyState {...props} /> : null}
        {items.map((item, index) => (
          <CandidateItem
            key={item.id}
            candidate={item}
            selected={item.id === selectedId}
            leaving={item.leaving === true}
            timedOut={props.isTimedOut(item)}
            // stagger 仅前 10 行 ×40ms（§7 A7）
            enterDelay={enteringIds.has(item.id) ? Math.min(index, 9) * 40 : null}
            jump={props.jumpCandidateId === item.id}
            onJumpConsumed={props.onJumpConsumed}
            onSelect={props.onSelect}
          />
        ))}
      </div>

      <footer className="rs-list-foot">
        {shown > 0 && shown < total ? (
          <Button variant="ghost" size="sm" onClick={props.onLoadMore} disabled={overCap}>
            加载更多
          </Button>
        ) : null}
        <span aria-live="polite">
          {overCap ? '已达展示上限，请用筛选缩小范围' : `已显示 ${shown} / 共 ${total}`}
        </span>
      </footer>
    </>
  )
}

function ListSkeleton() {
  // 首屏 6 行骨架（头像块 + 双行条），§3.4/§6.1；Skeleton 原生脉冲即 A2
  return (
    <div className="rs-list-skeleton" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="rs-sk-row">
          <Skeleton className="rs-sk-avatar" />
          <div className="rs-sk-lines">
            <Skeleton className="rs-sk-line rs-sk-half" />
            <Skeleton className="rs-sk-line rs-sk-two-thirds" />
          </div>
          <Skeleton className="rs-sk-line rs-sk-score" />
        </div>
      ))}
    </div>
  )
}

// 空态三文案：无岗位（引导建岗位）/ 筛选无结果（清除筛选）/ 无候选人（引导上传）——§3.4
function EmptyState({ hasJobs, hasFilterActive, onUploadRequest, onCreateJobRequest, onClearFilters }: CandidateListProps) {
  if (!hasJobs) {
    return (
      <div className="rs-empty">
        <i className="ri-briefcase-line rs-empty-icon" aria-hidden="true" />
        <strong>还没有岗位，先新建一个岗位</strong>
        <small>岗位描述（JD）是 AI 匹配评分的依据</small>
        <Button onClick={onCreateJobRequest}>
          <i className="ri-add-line" aria-hidden="true" />
          新建岗位
        </Button>
      </div>
    )
  }
  if (hasFilterActive) {
    return (
      <div className="rs-empty">
        <i className="ri-filter-3-line rs-empty-icon" aria-hidden="true" />
        <strong>没有符合条件的候选人</strong>
        <Button variant="outline" onClick={onClearFilters}>
          清除筛选
        </Button>
      </div>
    )
  }
  return (
    <div className="rs-empty">
      <i className="ri-upload-cloud-line rs-empty-icon" aria-hidden="true" />
      <strong>暂无候选人，上传简历文件开始初筛</strong>
      <small>支持 .docx / .pdf，可多选</small>
      <Button onClick={onUploadRequest}>
        <i className="ri-upload-cloud-line" aria-hidden="true" />
        上传简历文件
      </Button>
    </div>
  )
}

interface ItemProps {
  candidate: CandidateView
  selected: boolean
  // A8 淡出中：挂退场动画并退出可达（pointer-events/aria-hidden 由样式与属性保证）
  leaving: boolean
  timedOut: boolean
  enterDelay: number | null
  jump: boolean
  onJumpConsumed: () => void
  onSelect: (id: string) => void
}

/**
 * 双行列表卡（§3.4 形态 A2；§11 memo：引用比较 + 派生布尔）
 *
 * 行结构：28px 首字头像（底色=状态强色）→ 主行 姓名+匹配分+状态徽标 → 副行
 * 「年限 · 学历 · 公司」（parsing/failed 时改为解析说明/失败原因一行摘要）。
 */
const CandidateItem = memo(function CandidateItem({ candidate, selected, leaving, timedOut, enterDelay, jump, onJumpConsumed, onSelect }: ItemProps) {
  const name = candidate.name || candidate.sourceFileName || '未命名候选人'
  const tier = scoreTier(candidate.matchScore)
  const subtitle =
    candidate.status === 'failed'
      ? candidate.failureReason || '解析失败'
      : candidate.status === 'parsing' || candidate.status === 'draft'
        ? timedOut
          ? '解析已超过 10 分钟，系统会自动重投'
          : 'AI 正在解析该简历…'
        : [candidate.yearsOfExperience ?? '', candidate.education ?? '', candidate.currentCompany ?? '']
            .filter(Boolean)
            .join(' · ') || formatMonthDay(candidate.createdAt)

  // A15 跳转脉冲（240ms×2 往复）播完即上报清除，避免每次重渲重播
  useEffect(() => {
    if (!jump) return undefined
    const timer = window.setTimeout(onJumpConsumed, 520)
    return () => window.clearTimeout(timer)
  }, [jump, onJumpConsumed])

  return (
    <div
      data-candidate-id={candidate.id}
      className={`rs-item${enterDelay !== null ? ' rs-enter' : ''}${jump ? ' rs-jump' : ''}${leaving ? ' rs-leaving' : ''}`}
      style={enterDelay !== null ? ({ '--rs-stagger': `${enterDelay}ms` } as React.CSSProperties) : undefined}
      role="option"
      aria-selected={selected}
      aria-current={selected ? 'true' : undefined}
      aria-hidden={leaving ? true : undefined}
      tabIndex={-1}
      onClick={() => {
        // 淡出中的行不再响应选中（A8 退场竞态）
        if (!leaving) onSelect(candidate.id)
      }}
    >
      <span className="rs-mark" style={{ background: statusAccent(candidate.status, timedOut) }} aria-hidden="true">
        {name.slice(0, 1)}
      </span>
      <span className="rs-item-main">
        <span className="rs-item-title">
          {/* 截断文本挂原生 title：hover 读全名（§8.5.3 长文本不挤压的可达补强，无新依赖） */}
          <span className="rs-item-name" title={name}>{name}</span>
          {candidate.sourceFileName ? (
            <i className="ri-file-line rs-item-source" title={`来源：${candidate.sourceFileName}`} aria-label={`来源文件 ${candidate.sourceFileName}`} />
          ) : null}
          <CandidateBadge status={candidate.status} timedOut={timedOut} />
        </span>
        <span className="rs-item-meta" title={subtitle}>{subtitle}</span>
      </span>
      <span className="rs-item-score">
        {/* 匹配分：右侧固定 40px Badge（tabular-nums）+ 3px Progress 细条（分档色 §3.4） */}
        <Badge variant="secondary" className="rs-score-badge">
          {candidate.matchScore ?? '—'}
        </Badge>
        <Progress
          value={Math.max(0, Math.min(100, candidate.matchScore ?? 0))}
          className={`rs-score-bar${tier === 'amber' ? ' tier-amber' : tier === 'red' ? ' tier-red' : ''}`}
          aria-label={`匹配分 ${candidate.matchScore ?? 0}`}
        />
      </span>
    </div>
  )
})
