import * as React from 'react'
import { CircleAlert, LoaderCircle, RefreshCw } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@xpert-ai/plugin-shadcn-ui'
import type { AnalysisDetail, AnalysisSummary, HumanDecision, ResumeMatchViewData } from '../../../types.js'
import {
  executeAction,
  invokeClientCommand,
  readMessage,
  requestData,
  startBridge,
  type HostEventPayload,
  type ViewHostInit
} from './bridge.js'
import { AppSidebar, EmptyState, PageHeader, SkeletonScreen, Toast, type ToastState } from './ui.js'
import { NewAnalysis, type PreparedAnalysisInput } from './new-analysis.js'
import { ProcessingView, FailureView } from './processing-view.js'
import { ResultView } from './result-view.js'

type Screen = 'detail' | 'new'

interface QueryState {
  page: number
  pageSize: number
  selectionId?: string
}

export function App() {
  const [data, setData] = React.useState<ResumeMatchViewData | null>(null)
  const [init, setInit] = React.useState<ViewHostInit | null>(null)
  const [screen, setScreen] = React.useState<Screen>('detail')
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [toast, setToast] = React.useState<ToastState | null>(null)
  const query = React.useRef<QueryState>({ page: 1, pageSize: 20 })
  const loadSequence = React.useRef(0)
  const loadRef = React.useRef<() => Promise<void>>(async () => {})
  const selectedRef = React.useRef<AnalysisDetail | null>(null)
  const pollCount = React.useRef(0)
  const prevStatus = React.useRef<string | null>(null)

  const showToast = React.useCallback(
    (message: string, tone: ToastState['tone'] = 'success') => {
      setToast({ id: Date.now(), message, tone })
    },
    []
  )

  const load = React.useCallback(async () => {
    const sequence = ++loadSequence.current
    try {
      const next = await requestData({
        page: query.current.page,
        pageSize: query.current.pageSize,
        selectionId: query.current.selectionId
      })
      if (sequence !== loadSequence.current) return
      setData(next)
      selectedRef.current = next.selected
      if (next.selected?.id && next.selected.id !== query.current.selectionId) {
        query.current.selectionId = next.selected.id
      }
      setError('')
      const nextStatus = next.selected?.status ?? null
      if (prevStatus.current === 'waiting_ai' && nextStatus === 'review') {
        showToast('智能分析已完成，请核对依据并完成人工确认。')
      }
      if (prevStatus.current === 'waiting_ai' && nextStatus === 'failed') {
        showToast('本轮分析失败，记录已保留，可以在工作台重新分析。', 'warning')
      }
      prevStatus.current = nextStatus
    } catch (loadError) {
      if (sequence !== loadSequence.current) return
      setError(
        loadError instanceof Error
          ? loadError.message
          : '加载工作台失败，请刷新后重试。'
      )
    } finally {
      if (sequence === loadSequence.current) setLoading(false)
    }
  }, [showToast])
  loadRef.current = load

  React.useEffect(
    () =>
      startBridge(
        (nextInit) => {
          setInit(nextInit)
          query.current = {
            page: nextInit.initialQuery?.page ?? 1,
            pageSize: nextInit.initialQuery?.pageSize ?? 20,
            selectionId: nextInit.initialQuery?.selectionId
          }
          setScreen('detail')
          void loadRef.current()
        },
        (_event: HostEventPayload) => {
          void loadRef.current()
        }
      ),
    []
  )

  React.useEffect(() => {
    if (data?.selected?.status !== 'waiting_ai') {
      pollCount.current = 0
      return
    }
    const timer = setInterval(() => {
      pollCount.current += 1
      if (pollCount.current > 40) {
        clearInterval(timer)
        return
      }
      void loadRef.current()
    }, 3000)
    return () => clearInterval(timer)
  }, [data?.selected?.id, data?.selected?.status])

  const scrollToTop = () => {
    document.querySelector('.rm-scroll')?.scrollTo({ top: 0, behavior: 'smooth' })
  }
  React.useEffect(() => {
    scrollToTop()
  }, [screen, data?.selected?.id])

  const selectAnalysis = (id: string) => {
    setScreen('detail')
    query.current.selectionId = id
    void load()
  }

  const openNew = () => {
    setScreen('new')
    setError('')
  }

  const backToDetail = () => {
    setScreen('detail')
    if (!query.current.selectionId && data?.items[0]) {
      query.current.selectionId = data.items[0].id
      void load()
    }
  }

  const runCommand = async (commandKey?: string, text?: string) => {
    if (!commandKey || !text) {
      throw new Error('分析任务已创建，但没有生成智能助理指令，请点击重新分析。')
    }
    await invokeClientCommand(commandKey, { text })
  }

  const startAnalysis = async (input: PreparedAnalysisInput) => {
    setBusy(true)
    try {
      const result = await executeAction('prepare_analysis', input)
      const analysisId = result.data?.analysisId
      if (analysisId) {
        query.current.selectionId = analysisId
      }
      setScreen('detail')
      await load()
      await runCommand(result.data?.commandKey, result.data?.payload?.text)
      showToast('分析任务已交给智能助理，结果写入后会进入待人工确认。')
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : '分析任务创建失败，请稍后重试。'
      )
      await load()
      throw startError
    } finally {
      setBusy(false)
    }
  }

  const retryAnalysis = async () => {
    const selected = data?.selected
    if (!selected) return
    setBusy(true)
    try {
      const result = await executeAction('retry_analysis', {
        analysisId: selected.id,
        expectedRevision: selected.revision
      })
      query.current.selectionId = selected.id
      await load()
      await runCommand(result.data?.commandKey, result.data?.payload?.text)
      showToast(`已重新发起第 ${(selected.attempt ?? 1) + 1} 轮分析，不会重复创建记录。`)
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : '重新分析失败，请稍后重试。')
    } finally {
      setBusy(false)
    }
  }

  const confirmAnalysis = async (input: {
    decision: HumanDecision
    score: number
    conclusion: string
  }) => {
    const selected = data?.selected
    if (!selected) return
    setBusy(true)
    try {
      await executeAction('confirm_analysis', {
        analysisId: selected.id,
        expectedRevision: selected.revision,
        humanDecision: input.decision,
        humanScore: input.score,
        humanConclusion: input.conclusion
      })
      await load()
      showToast('人工结论已保存，刷新页面仍能找到这条结果。')
    } finally {
      setBusy(false)
    }
  }

  const refresh = async () => {
    setBusy(true)
    try {
      await load()
      showToast('工作台已刷新。')
    } finally {
      setBusy(false)
    }
  }

  const copySummary = async () => {
    const selected = data?.selected
    if (!selected?.result) {
      showToast('当前还没有可复制的分析结论。', 'warning')
      return
    }
    const content = [
      `候选人：${selected.candidateName}`,
      `岗位：${selected.jobTitle}`,
      `综合匹配度：${selected.humanScore ?? selected.result.overallScore} 分（${selected.result.level}）`,
      ...(selected.status === 'confirmed'
        ? [`人工决定：${selected.humanDecision}`, `人工结论：${selected.humanConclusion}`]
        : [`AI建议（待人工确认）：${selected.result.recommendation}`]),
      `AI原始判断：${selected.result.summary}`,
      ...selected.result.highlights.map((item) => `匹配依据：${item}`),
      ...selected.result.risks.map((item) => `待核实：${item}`)
    ].join('\n')
    try {
      await navigator.clipboard.writeText(content)
      showToast('匹配摘要已复制到剪贴板。')
    } catch {
      showToast('当前环境无法写入剪贴板，请打开完整简历后复制。', 'warning')
    }
  }

  const selected = data?.selected ?? null
  const items: AnalysisSummary[] = data?.items ?? []
  const detailScreenVisible = screen === 'detail' && selected !== null
  const headerStatus = detailScreenVisible ? selected?.status : undefined

  return (
    <div className="rm-app">
      <AppSidebar
        items={items}
        selectedId={selected?.id}
        onSelect={selectAnalysis}
        onNew={openNew}
      />
      <div className="rm-workspace">
        {items.length > 0 && (
          <div className="rm-history-picker">
            <Select value={selected?.id ?? items[0].id} onValueChange={selectAnalysis}>
              <SelectTrigger aria-label="打开历史分析"><SelectValue placeholder="打开历史分析" /></SelectTrigger>
              <SelectContent>
                {items.map((item) => <SelectItem key={item.id} value={item.id}>{item.candidateName} · {item.jobTitle}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <PageHeader
          screen={screen}
          candidateName={selected?.candidateName}
          jobTitle={selected?.jobTitle}
          company={selected?.company}
          jobCity={selected?.jobCity}
          salary={selected?.salary}
          status={headerStatus}
          onBack={backToDetail}
          onNew={openNew}
          onCopy={copySummary}
        />
        <main className="rm-scroll">
          <div className="rm-content">
            {error && (
              <div className="rm-error-banner" role="alert">
                <CircleAlert />
                <span>{error}</span>
                <button type="button" onClick={() => void refresh()}>
                  <RefreshCw /> 重试
                </button>
              </div>
            )}
            {loading && !data ? (
              <SkeletonScreen />
            ) : screen === 'new' ? (
              <NewAnalysis busy={busy} onStart={startAnalysis} />
            ) : !selected ? (
              <EmptyState onCreate={openNew} />
            ) : selected.status === 'waiting_ai' ? (
              <ProcessingView
                analysis={selected}
                busy={busy}
                onRetry={retryAnalysis}
                onRefresh={refresh}
                onNew={openNew}
              />
            ) : selected.status === 'failed' ? (
              <FailureView
                analysis={selected}
                busy={busy}
                onRetry={retryAnalysis}
                onNew={openNew}
              />
            ) : (
              <ResultView
                analysis={selected}
                busy={busy}
                onConfirm={confirmAnalysis}
                onRetry={retryAnalysis}
                onRefresh={refresh}
              />
            )}
            {busy && !loading && (
              <div className="rm-busy-strip">
                <LoaderCircle className="rm-spin" />
                正在同步工作台状态
              </div>
            )}
          </div>
        </main>
      </div>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  )
}

export function resolveInitialLocale(_init: ViewHostInit | null) {
  return 'zh-CN'
}

export const _readMessage = readMessage
