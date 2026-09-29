/**
 * 简历初筛工作台主编排（蓝图 §6.1 视图级状态机 + §11 性能约束）
 *
 * 数据流：ready→init→requestData（§8.2 时序）；刷新两柱 = action 回执 refresh:true
 * 触发 silentRefresh + 存在 parsing/上传进行中行时 30s 心跳轮询（链路 B 无 hostEvent
 * 主路径，hostEvent 仅对话旁路）。错误双通道：顶部 notice（role=alert，10s 自动消失）
 * + notify。布局：单栏列表独占（§5.1），详情只活在 Sheet 抽屉；<560px 头部折叠。
 */
import React from '../react-shim'
import { Button, Sheet, SheetContent, SheetHeader, SheetTitle } from '@xpert-ai/plugin-shadcn-ui'
import { executeAction, executeFileAction, notify, requestData, setOnLateReceipt } from '../bridge'
import { CandidateList } from './candidate-list'
import { DetailContent } from './candidate-detail'
import { JobHeader } from './job-header'
import { UploadDialog } from './upload-dialog'
import { PreviewDialog } from './preview-dialog'
import type { DispositionKey } from './action-bar'
import type { SaveOutcome } from './candidate-detail'
import type { CandidateView, HostContext, JobCreateOutcome, JobView, PreviewPayload, ResumeScreenCandidatePatchMirror, ResumeScreenViewData, SortBy, SortDir, StatusFilter, UploadRow } from '../types'
import {
  DOM_ROW_CAP,
  LEAVE_FADE_MS,
  PAGE_SIZE,
  PARSE_POLL_MS,
  buildQuery,
  isObject,
  isParsingTimedOut,
  looksLikeRevisionConflict,
  mapUploadFailure,
  mergeAppendedPage,
  mergeRefreshedList,
  nextPendingId,
  normalizeViewData,
  parseActionResult,
  resolveText,
  UPLOAD_MAX_BYTES,
  UPLOAD_OVERSIZE_HINT
} from '../utils'

const { useCallback, useEffect, useMemo, useRef, useState } = React

interface ViewState {
  jobId: string | null
  status: StatusFilter
  sortBy: SortBy
  sortDir: SortDir
  search: string
}

const INITIAL_VIEW: ViewState = { jobId: null, status: 'all', sortBy: 'matchScore', sortDir: 'desc', search: '' }

// 宿主 payload 初始岗位（无数据阶段先占位，避免首查丢 jobId：对话开卡带岗位 id 的场景）
function pickJobIdFromContext(context: HostContext): string | null {
  const fromPayload = context.payload?.parameters?.jobId ?? context.initialQuery?.parameters?.jobId
  const value = Array.isArray(fromPayload) ? fromPayload[0] : fromPayload
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

// 首屏无 jobId 时定默认岗位：服务端返回 job > 首个岗位
function initialJobId(context: HostContext, data: ResumeScreenViewData): string | null {
  return data.job?.id ?? pickJobIdFromContext(context) ?? data.jobs[0]?.id ?? null
}

export function ResumeScreenWorkbench({ context }: { context: HostContext }) {
  const [data, setData] = useState<ResumeScreenViewData | null>(null)
  const [items, setItems] = useState<CandidateView[]>([])
  const [view, setView] = useState<ViewState>(() => ({
    ...INITIAL_VIEW,
    jobId: pickJobIdFromContext(context),
    search: context.initialQuery?.search ?? ''
  }))
  const [pagesLoaded, setPagesLoaded] = useState(1)
  const [firstLoading, setFirstLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [queueRows, setQueueRows] = useState<UploadRow[]>([])
  const [queueBusy, setQueueBusy] = useState(false)
  const [jobPulseSeq, setJobPulseSeq] = useState(0)
  const [jumpCandidateId, setJumpCandidateId] = useState<string | null>(null)
  // 空态 CTA「上传简历文件」信号：递增触发上传弹窗直接弹出文件选择器（§3.4 空态 CTA）
  const [uploadRequestSeq, setUploadRequestSeq] = useState(0)
  // 上传弹窗开关：工具条/空态 CTA 的唯一上传入口（§5.3），行态关闭后保留供回看
  const [uploadOpen, setUploadOpen] = useState(false)
  const [enteringIds, setEnteringIds] = useState<Set<string>>(() => new Set())
  const [nowTick, setNowTick] = useState(() => Date.now())
  const [sheetOpen, setSheetOpen] = useState(false)
  // 二态（T14 单栏化）：xs 仅用于头部文案折叠与 Sheet 满宽，详情不再有宽栏常驻形态
  const [widthMode, setWidthMode] = useState<'default' | 'xs'>('default')
  // 「再等等」抑制解析超时卡 5 分钟（§6.4 纯前端记忆）
  const [timeoutDismiss, setTimeoutDismiss] = useState<Record<string, number>>({})

  const shellRef = useRef<HTMLElement | null>(null)
  const viewRef = useRef(view)
  viewRef.current = view
  const selectedRef = useRef<string | null>(selectedId)
  selectedRef.current = selectedId
  // A8 淡出提交令牌：每轮合并 +1，过期的收尾定时器令牌不符即失效，防旧快照覆盖新刷新结果
  const removalToken = useRef(0)
  const queueSeq = useRef(0)
  const noticeTimer = useRef<number | null>(null)

  // ===== 加载 =====

  function showNotice(message: string) {
    setNotice(message)
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current)
    // notice 10s 自动消失（§6.1 通用错误出口）
    noticeTimer.current = window.setTimeout(() => setNotice(''), 10_000)
  }

  const load = useCallback(
    async (mode: 'first' | 'refresh' | 'more'): Promise<ResumeScreenViewData | null> => {
      const current = viewRef.current
      const loaded = mode === 'more' ? pagesLoaded : mode === 'refresh' ? pagesLoaded : 1
      const query = buildQuery({
        jobId: current.jobId,
        status: current.status,
        sortBy: current.sortBy,
        sortDir: current.sortDir,
        search: current.search,
        page: mode === 'more' ? pagesLoaded + 1 : 1,
        // M10 I-1：「加载更多」= 追加下一页且 page.size=20（§3.4/§11）。服务端窗口为 start=(page-1)*pageSize，
        // more 若把 pageSize 传成已加载跨度，第二次起 start 跳越、返回空片，41+ 候选人永不可达——故固定 PAGE_SIZE；
        // 刷新/首屏保留一次取回已加载全跨度的语义，避免多页请求拼接竞态（§11 DOM 上限内）
        pageSize: mode === 'more' ? PAGE_SIZE : Math.min(DOM_ROW_CAP, PAGE_SIZE * Math.max(1, loaded))
      })
      if (mode === 'first') setFirstLoading(true)
      else setRefreshing(true)
      try {
        const response = await requestData(query)
        const result = normalizeViewData(response)
        setData(result)
        setItems((previous) => {
          const nextIds = new Set(result.candidates.map((item) => item.id))
          if (mode === 'more') {
            // I-2 竞态防护：more 回执与在途淡出窗口交叠时，递增令牌作废旧定时器，
            // 并以存活行为基底追加——旧定时器若存活会以陈旧单页快照把新页整页误标
            // leaving 成无后续清理的幽灵行；淡出窗口就此提前终结（删除行即时离场），
            // 刷新合并对存活行的引用复用已在 merge 时完成，截断不影响数据正确性
            removalToken.current += 1
            const merged = mergeAppendedPage(previous, result.candidates)
            setEnteringIds(new Set(result.candidates.map((item) => item.id)))
            return merged
          }
          // 仅对真实新增 id 播 A7（对比 prev/next 集合，防每轮全列表重播，§7 降级纪律）
          const previousIds = new Set(previous.map((item) => item.id))
          setEnteringIds(new Set([...nextIds].filter((id) => !previousIds.has(id))))
          // 静默刷新合并（§11 + A8）：内容未变的行沿用旧引用，memo 行不重渲（心跳/回执轮询的重渲
          // 成本收敛到真实变化行）；被移除行挂 leaving 副本原地淡出，窗口结束提交纯净列表。
          // 保留行排列已是最终顺序 ⇒ 淡出结束无行跳位；令牌防旧定时器覆盖更新的刷新结果。
          const merged = mergeRefreshedList(previous, result.candidates)
          const token = ++removalToken.current
          if (merged.length === result.candidates.length) return merged
          const finalList = result.candidates
          window.setTimeout(() => {
            if (removalToken.current !== token) return
            setItems((current) => mergeRefreshedList(current.filter((item) => !item.leaving), finalList))
          }, LEAVE_FADE_MS)
          return merged
        })
        if (mode === 'more') setPagesLoaded(pagesLoaded + 1)
        setLoadError('')
        // 首屏无 jobId：按服务端返回 job（或 jobs[0]）定默认岗位
        if (!current.jobId && result.jobs.length > 0) {
          setView((state) => ({ ...state, jobId: initialJobId(context, result) }))
        }
        return result
      } catch (error) {
        const message = error instanceof Error ? error.message : '视图数据加载失败'
        if (mode === 'first') {
          setLoadError(message)
        } else {
          // 刷新失败保留旧数据 + 顶部 notice（§6.1 error 不整页替换）
          showNotice(message)
        }
        return null
      } finally {
        setFirstLoading(false)
        setRefreshing(false)
      }
    },
    [context, pagesLoaded]
  )

  const silentRefresh = useCallback(async () => {
    await load('refresh')
  }, [load])

  // init 后首屏请求 + 视图态变化重查（岗位/筛选/排序/搜索同源刷新）
  useEffect(() => {
    void load(items.length === 0 && !data ? 'first' : 'refresh')
    // 仅在视图查询态变化时触发；data/items 是查询结果不列入依赖防回环
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  // 宿主对话旁路事件（保留订阅，§6.1 v4 降级为旁路）：触发一次静默刷新
  useEffect(() => {
    window.__resumeScreenReload = () => void silentRefresh()
    return () => {
      delete window.__resumeScreenReload
    }
  }, [silentRefresh])

  // M10 M-4 竞态裁决：上传回执超时后队列行已判「失败」终态，迟到的真实回执不得再翻行，
  // 仅触发一次列表刷新校准——候选人行自会呈现服务端事实（文件实际入库则列表出现该行）
  useEffect(() => {
    setOnLateReceipt(() => void silentRefresh())
    return () => setOnLateReceipt(null)
  }, [silentRefresh])

  // 容器宽度探测（§4：iframe 视口≠宿主视口，ResizeObserver 属性驱动布局切换）
  useEffect(() => {
    const shell = shellRef.current
    if (!shell || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0
      setWidthMode(width < 560 ? 'xs' : 'default')
    })
    observer.observe(shell)
    return () => observer.disconnect()
  }, [])

  // ===== 30s 心跳（§11）：存在 parsing/上传进行中行时轮询；parsing 清空即停轮 =====

  // A8 淡出中的行只是退场动画残留，不参与选中/统计/心跳等业务派生（渲染列表仍用 items）
  const liveItems = useMemo(() => (items.some((item) => item.leaving) ? items.filter((item) => !item.leaving) : items), [items])

  const hasParsing = liveItems.some((item) => item.status === 'parsing' || item.status === 'draft')
  // 上传进行中的乐观行同样维持心跳轮询（回执后列表校准，§11）
  const hasQueueWorking = queueRows.some((row) => row.status === 'queued' || row.status === 'uploading')
  useEffect(() => {
    if (!hasParsing && !hasQueueWorking) return undefined
    const timer = window.setInterval(() => {
      setNowTick(Date.now())
      void silentRefresh()
    }, PARSE_POLL_MS)
    return () => window.clearInterval(timer)
  }, [hasParsing, hasQueueWorking, silentRefresh])

  // 超时判定集中重算：行组件只消费布尔派生态（§11 memo 稳定引用）
  const isTimedOut = useCallback(
    (candidate: CandidateView) => isParsingTimedOut(candidate, nowTick),
    [nowTick]
  )

  const selected = useMemo(() => liveItems.find((item) => item.id === selectedId) ?? null, [liveItems, selectedId])

  // 行级回调必须引用稳定：CandidateItem memo 以 onSelect/onJumpConsumed 做浅比较，
  // 内联箭头会让每次 workbench 重渲染（心跳 tick/notice/扫描线开关）击穿整列表 memo（§11）
  const handleSelect = useCallback((id: string) => {
    setSelectedId(id)
    // 单栏布局：点行一律开 Sheet 抽屉承载详情与处置条（§5.1）
    setSheetOpen(true)
  }, [])
  const consumeJumpHighlight = useCallback(() => setJumpCandidateId(null), [])

  // 键盘导航唯一实现：列表与抽屉共用同一游标（选中即同步抽屉内容，§5.5）
  // 复用既有 liveItems（淡出残影行不可达）与 handleSelect（点行同款副作用：抽屉已开时内容自然切换）
  function moveSelection(delta: number) {
    const rows = liveItems
    if (!rows.length) return
    const index = rows.findIndex((item) => item.id === selectedId)
    const nextIndex = Math.min(rows.length - 1, Math.max(0, (index < 0 ? 0 : index) + delta))
    handleSelect(rows[nextIndex].id)
  }

  // ===== 视图态变更 =====

  function changeView(patch: Partial<ViewState>, options?: { clearSelection?: boolean }) {
    setView((state) => ({ ...state, ...patch }))
    if (options?.clearSelection) setSelectedId(null)
    setPagesLoaded(1)
  }

  function selectJob(jobId: string) {
    // 切换岗位：清空选中与筛选（§3.2，筛选与搜索一并重置）
    changeView({ jobId, status: 'all', search: '' }, { clearSelection: true })
  }

  function clearFilters() {
    changeView({ status: 'all', search: '' })
  }

  // ===== 处置动作（§3.6：成功后自动滑向下一条 pending_review） =====

  const runDisposition = useCallback(
    async (key: DispositionKey, candidate: CandidateView) => {
      if (busyKey) return
      setBusyKey(key)
      try {
        const response = await executeAction(key, candidate.id, { candidateId: candidate.id }, { jobId: candidate.jobId })
        const result = parseActionResult(response)
        const message = resolveText(result.message)
        if (!result.success) {
          showNotice(message || '操作失败')
          notify(message || '操作失败', 'error')
          return
        }
        // 重试乐观更新：条目徽标立即转「解析中」（§6.3），随后靠 parsing 心跳轮询校准
        if (key === 'retry_candidate') {
          setItems((list) => list.map((item) => (item.id === candidate.id ? { ...item, status: 'parsing' as const, failureReason: undefined } : item)))
        }
        notify(message || (key === 'retry_candidate' ? '已重新开始解析' : '处置成功'))
        const actedSelected = selectedRef.current === candidate.id
        await silentRefresh()
        if (actedSelected && key !== 'retry_candidate') {
          // 仅当被处置者当前被选中时推进到下一条待审（沿列表顺序，respectSorting §3.6）
          setItems((list) => {
            const nextId = nextPendingId(list.filter((item) => !item.leaving), candidate.id)
            if (nextId) setSelectedId(nextId)
            return list
          })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : '操作失败'
        showNotice(message)
        notify(message, 'error')
      } finally {
        setBusyKey(null)
      }
    },
    [busyKey, silentRefresh]
  )

  // ===== 人工修正保存（§6.5 乐观锁） =====

  const saveCandidate = useCallback(
    async (candidate: CandidateView, patch: ResumeScreenCandidatePatchMirror, expectedRevision: number): Promise<SaveOutcome> => {
      try {
        const response = await executeAction(
          'update_candidate',
          candidate.id,
          { candidateId: candidate.id, patch, expectedRevision },
          { jobId: candidate.jobId }
        )
        const result = parseActionResult(response)
        const message = resolveText(result.message)
        if (!result.success) {
          // 冲突判定优先看回执 data.code（F5）；message 正则只是旧回执兜底
          const conflict = looksLikeRevisionConflict(message, isObject(result.data) ? result.data.code : undefined)
          if (!conflict) {
            showNotice(message || '保存失败')
            notify(message || '保存失败', 'error')
          }
          return { success: false, conflict, message }
        }
        notify(message || '已保存')
        if (result.refresh) await silentRefresh()
        return { success: true, conflict: false, message }
      } catch (error) {
        const message = error instanceof Error ? error.message : '保存失败'
        showNotice(message)
        notify(message, 'error')
        return { success: false, conflict: false, message }
      }
    },
    [silentRefresh]
  )

  // ===== 简历预览（spec §5.4：action 取字节 → 弹窗按 kind 分支渲染） =====

  const [preview, setPreview] = useState<{ candidateId: string; fileName: string; payload: PreviewPayload } | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)

  const openPreview = useCallback(
    async (candidate: CandidateView) => {
      if (previewBusy) return
      setPreviewBusy(true)
      try {
        const response = await executeAction('preview_candidate', candidate.id, { candidateId: candidate.id }, { jobId: candidate.jobId })
        const result = parseActionResult(response)
        const message = resolveText(result.message)
        if (!result.success || !isObject(result.data)) {
          // 失败双通道：顶部 notice + notify（§6.4 与重试失败同纪律）
          showNotice(message || '简历预览加载失败')
          notify(message || '简历预览加载失败', 'error')
          return
        }
        const kind = result.data.kind === 'pdf' ? 'pdf' : 'html'
        setPreview({
          candidateId: candidate.id,
          fileName: typeof result.data.fileName === 'string' ? result.data.fileName : candidate.sourceFileName || '简历',
          payload: (kind === 'pdf' ? { kind: 'pdf', base64: String(result.data.base64 ?? '') } : { kind: 'html', html: String(result.data.html ?? '') }) as PreviewPayload
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : '简历预览加载失败'
        showNotice(message)
        notify(message, 'error')
      } finally {
        setPreviewBusy(false)
      }
    },
    [previewBusy]
  )

  // ===== 新建岗位（v4 D1：成功自动切岗、失败保持 Dialog） =====

  const createJob = useCallback(
    async (title: string, jdText: string): Promise<JobCreateOutcome> => {
      try {
        const response = await executeAction('create_job', null, { title, jdText }, {})
        const result = parseActionResult(response)
        const message = resolveText(result.message)
        if (!result.success) {
          // 标题重复（服务端 jdHash 幂等语义）等：toast 提示，Dialog 由子组件回焦名称字段
          notify(message || '该岗位已存在', 'error')
          return { ok: false }
        }
        notify(message || '岗位已创建')
        const jobField = isObject(result.data) ? result.data.job : undefined
        const job = isObject(jobField) ? (jobField as unknown as JobView) : null
        if (job?.id) {
          // 成功 → 自动切换到新岗位：清空选中与筛选并重新 requestData（§3.2）
          changeView({ jobId: job.id, status: 'all', search: '' }, { clearSelection: true })
        } else {
          void silentRefresh()
        }
        return { ok: true }
      } catch (error) {
        const message = error instanceof Error ? error.message : '新建岗位失败'
        // M10 M-3：「其他异常」= Dialog 内 notice 红变体 + notify 双通道（§3.2），
        // 不再走全局顶部 notice；notice 文案交回 Dialog 呈现，Dialog 保持打开
        notify(message, 'error')
        return { ok: false, notice: message }
      }
    },
    // changeView 仅用函数式 setState，无外部状态依赖；静默刷新一并声明依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [silentRefresh]
  )

  // ===== 上传编排（§5.3 弹窗行态 + §6.6 失败指引：乐观入队 → 逐文件 executeFileAction → 回执推进行态） =====

  const canUpload = useCallback((): boolean => {
    if (viewRef.current.jobId) return true
    // 未选岗位前置拦截：不发请求，notify 错误 + 岗位蓝圈脉冲一次（AC2.1/§3.7/A13）
    notify('请先选择岗位', 'error')
    setJobPulseSeq((seq) => seq + 1)
    return false
  }, [])

  function patchUploadRow(localId: number, patch: Partial<UploadRow>) {
    // 只 patch 状态字段（浅比较 fileName+status 语义，§11 不整弹窗列表重渲）
    setQueueRows((rows) => rows.map((item) => (item.localId === localId ? { ...item, ...patch } : item)))
  }

  const pickFiles = useCallback(
    async (files: File[]) => {
      const jobId = viewRef.current.jobId
      if (!jobId) return
      setQueueBusy(true)
      // 乐观入队 N 行「排队中」（选择即入队，批量感呈现 §6.6），再逐文件走宿主文件通道
      const rows = files.map((file) => {
        const row: UploadRow = { localId: ++queueSeq.current, fileName: file.name, status: 'queued', startedAt: Date.now() }
        setQueueRows((current) => [row, ...current].slice(0, 40))
        return row
      })
      try {
        for (let index = 0; index < files.length; index += 1) {
          const file = files[index]
          const row = rows[index]
          // ≤10MB 前端预检（§3.7/D5）：超限直接落失败行并给指引，不占字节通道；服务端仍会复校
          if (file.size > UPLOAD_MAX_BYTES) {
            patchUploadRow(row.localId, { status: 'failed', failureReason: UPLOAD_OVERSIZE_HINT })
            notify(`${file.name}：${UPLOAD_OVERSIZE_HINT}`, 'error')
            continue
          }
          patchUploadRow(row.localId, { status: 'uploading' })
          try {
            const response = await executeFileAction('upload_resume_files', null, {}, { jobId }, file)
            const result = parseActionResult(response)
            const dataField = isObject(result.data) ? result.data : {}
            const createdList = Array.isArray(dataField.created) ? (dataField.created as Array<{ id?: string }>) : []
            const skippedList = Array.isArray(dataField.skipped) ? dataField.skipped : []
            if (!result.success) {
              // 录入前失败：红行 + 可执行重新上传指引（四类原因映射，不产生候选人行 §6.6）
              const reason = mapUploadFailure(resolveText(result.message))
              patchUploadRow(row.localId, { status: 'failed', failureReason: reason })
              notify(`${file.name}：${reason}`, 'error')
              continue
            }
            if (createdList.length > 0) {
              patchUploadRow(row.localId, { status: 'created', candidateId: createdList[0]?.id })
            } else if (skippedList.length > 0) {
              patchUploadRow(row.localId, { status: 'skipped' })
            } else {
              // 回执无 created/skipped 明细：以刷新结果校准，行标记已创建但无跳转目标
              patchUploadRow(row.localId, { status: 'created' })
            }
          } catch (error) {
            const reason = mapUploadFailure(error instanceof Error ? error.message : '上传失败')
            patchUploadRow(row.localId, { status: 'failed', failureReason: reason })
            notify(`${file.name}：${reason}`, 'error')
          }
        }
      } finally {
        setQueueBusy(false)
      }
      // 全部文件回执后统一校准一次（每文件 refresh:true 语义的批处理等价，§11 防抖）
      await silentRefresh()
    },
    [silentRefresh]
  )

  const clearFailedRows = useCallback(() => {
    // A8 先淡出后移除（160ms），纯前端隐藏失败记录
    setQueueRows((rows) => rows.map((row) => (row.status === 'failed' ? { ...row, leaving: true } : row)))
    window.setTimeout(() => setQueueRows((rows) => rows.filter((row) => !(row.status === 'failed' && row.leaving))), 160)
  }, [])

  const jumpToCandidate = useCallback(
    (candidateId: string) => {
      setSheetOpen(false)
      setSelectedId(candidateId)
      setJumpCandidateId(candidateId)
    },
    []
  )

  // ===== 呈现 =====

  const loading = firstLoading || (!data && !loadError)
  const isError = Boolean(loadError) && !data && !firstLoading
  // 服务端总数优先；兜底用存活行数（淡出残影不计入「已显示/共」）
  const total = data?.page?.total ?? liveItems.length
  const hasFilterActive = view.status !== 'all' || view.search !== ''

  const detail = (
    <DetailContent
      candidate={selected}
      timedOut={selected ? isTimedOut(selected) : false}
      showTimeoutCard={selected ? isTimedOut(selected) && (timeoutDismiss[selected.id] ?? 0) < nowTick : false}
      now={nowTick}
      busyKey={busyKey}
      onDispose={(key) => (selected ? runDisposition(key, selected) : Promise.resolve())}
      onWaitMore={(candidateId) => setTimeoutDismiss((map) => ({ ...map, [candidateId]: Date.now() + 5 * 60_000 }))}
      onSave={saveCandidate}
      onConflictRefresh={() => void silentRefresh()}
      onPreview={openPreview}
    />
  )

  return (
    <main className="rs-shell" ref={shellRef} data-rs-width={widthMode}>
      {/* A1 增量刷新扫描线：首屏不用（Skeleton），静默刷新时出现一次 */}
      {refreshing && !firstLoading ? <span className="rs-scanline" aria-hidden="true" /> : null}

      <JobHeader
        jobs={data?.jobs ?? []}
        currentJobId={view.jobId}
        busy={busyKey !== null}
        refreshing={refreshing && !firstLoading}
        jobPulseSeq={jobPulseSeq}
        xsMode={widthMode === 'xs'}
        onSelectJob={selectJob}
        onCreateJob={createJob}
        onRefresh={() => void silentRefresh()}
      />

      {isError ? (
        // 首载失败：错误卡 + 重试（重新 requestData）；刷新失败只走 notice 不替换整页（§6.1）
        <section className="rs-content">
          <div className="rs-error-card" role="alert">
            <i className="ri-error-warning-line" aria-hidden="true" />
            <div>{loadError || '视图数据加载失败'}</div>
            <Button variant="outline" size="sm" onClick={() => void load('first')}>
              <i className="ri-refresh-line" aria-hidden="true" />
              重试
            </Button>
          </div>
        </section>
      ) : (
        <section className="rs-content">
          <div className="rs-list-panel">
            <CandidateList
              loading={loading}
              items={items}
              total={total}
              selectedId={selectedId}
              search={view.search}
              status={view.status}
              sortBy={view.sortBy}
              sortDir={view.sortDir}
              enteringIds={enteringIds}
              isTimedOut={isTimedOut}
              hasJobs={(data?.jobs.length ?? 0) > 0}
              hasFilterActive={hasFilterActive}
              jumpCandidateId={jumpCandidateId}
              onJumpConsumed={consumeJumpHighlight}
              onSelect={handleSelect}
              onMoveSelection={moveSelection}
              onSearch={(value) => changeView({ search: value })}
              onStatusChange={(value) => changeView({ status: value })}
              onSortChange={(value) => {
                const [sortBy, sortDir] = value.split(':') as [SortBy, SortDir]
                changeView({ sortBy, sortDir })
              }}
              onLoadMore={() => void load('more')}
              onClearFilters={clearFilters}
              onUploadRequest={() => {
                // 空态 CTA：前置岗位校验后开上传弹窗并直接弹文件选择器（§3.4/§5.3）
                if (!canUpload()) return
                setUploadOpen(true)
                setUploadRequestSeq((seq) => seq + 1)
              }}
              onCreateJobRequest={() => {
                // 空岗位 CTA 复用头部「新建岗位」Dialog：自定义事件打开（焦点陷阱不跨层）
                window.dispatchEvent(new CustomEvent('rs:open-create-job'))
              }}
            />
          </div>
        </section>
      )}

      {/* 详情抽屉（§5.5 三段）：DetailContent 自带 head/body/foot 三行栅格，容器只做遮罩与宽度；
          单栏布局下点行/键盘 Enter 均开 Sheet，xs 容器满宽（§4/§5.1） */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className={`rs-sheet-content${widthMode === 'xs' ? ' is-full' : ''}`}
          aria-describedby={undefined}
          // 抽屉打开时 ↑/↓ 仍可用：焦点被 Radix 陷阱收在抽屉内，键盘事件从这里派发才有效
          onKeyDown={(event: React.KeyboardEvent) => {
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
            event.preventDefault()
            moveSelection(event.key === 'ArrowDown' ? 1 : -1)
          }}
        >
          <SheetHeader className="rs-sheet-sr-head">
            <SheetTitle>候选人详情</SheetTitle>
          </SheetHeader>
          <div className="rs-sheet-body">{detail}</div>
        </SheetContent>
      </Sheet>

      {notice ? (
        <div className="rs-notice" role="alert">
          <i className="ri-error-warning-line" aria-hidden="true" />
          <span style={{ minWidth: 0 }}>{notice}</span>
          <button type="button" aria-label="关闭提示" onClick={() => setNotice('')}>
            <i className="ri-close-line" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <UploadDialog
        open={uploadOpen}
        rows={queueRows}
        busy={queueBusy}
        uploadRequestSeq={uploadRequestSeq}
        onClose={(next) => {
          setUploadOpen(next)
          // 关闭后保留行态，供下次打开回看结果；清空只由「清除失败记录」触发
        }}
        onPickFiles={(files) => void pickFiles(files)}
        onClearFailed={clearFailedRows}
        onJumpToCandidate={(id) => {
          setUploadOpen(false)
          jumpToCandidate(id)
        }}
      />

      {/* 简历预览弹窗（§5.4）：有 preview 状态即挂载，关闭即卸载并触发 Blob URL 释放 */}
      {preview ? (
        <PreviewDialog
          open
          fileName={preview.fileName}
          payload={preview.payload}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </main>
  )
}
