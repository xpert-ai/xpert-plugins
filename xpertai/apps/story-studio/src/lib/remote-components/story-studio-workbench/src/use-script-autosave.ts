import * as React from 'react'
import type { ProductionView } from './production-data'

export type ScriptSaveState = 'saved' | 'dirty' | 'saving' | 'error'

type CommitScriptProduction = (
  draft: ProductionView,
  changeSummary: string,
  options?: { silent?: boolean }
) => Promise<boolean>

export function useScriptAutosave(options: {
  production: ProductionView
  autosaveSummary: string
  versionSummary: string
  onCommit: CommitScriptProduction
  debounceMs?: number
}) {
  const [draft, setDraft] = React.useState(() =>
    structuredClone(options.production)
  )
  const [saveState, setSaveState] =
    React.useState<ScriptSaveState>('saved')
  const [historyIndex, setHistoryIndex] = React.useState(0)
  const historyIndexRef = React.useRef(0)
  const draftRef = React.useRef(draft)
  const dirtyRef = React.useRef(false)
  const savingRef = React.useRef(false)
  const queuedRef = React.useRef(false)
  const forceVersionRef = React.useRef(false)
  const versionRef = React.useRef(0)
  const identityRef = React.useRef(productionIdentity(options.production))
  const timerRef = React.useRef<number | null>(null)
  const historyRef = React.useRef<ProductionView[]>([
    structuredClone(options.production)
  ])
  const commitRef = React.useRef(options.onCommit)
  const summariesRef = React.useRef({
    autosave: options.autosaveSummary,
    version: options.versionSummary
  })
  const savePromiseRef = React.useRef<Promise<boolean> | null>(null)
  const flushRef = React.useRef<(forceVersion?: boolean) => Promise<boolean>>(
    async () => true
  )

  React.useEffect(() => {
    commitRef.current = options.onCommit
    summariesRef.current = {
      autosave: options.autosaveSummary,
      version: options.versionSummary
    }
  }, [options.onCommit, options.autosaveSummary, options.versionSummary])

  React.useEffect(() => {
    const identity = productionIdentity(options.production)
    if (identity !== identityRef.current) {
      const next = structuredClone(options.production)
      identityRef.current = identity
      draftRef.current = next
      historyRef.current = [structuredClone(next)]
      historyIndexRef.current = 0
      versionRef.current = 0
      dirtyRef.current = false
      setDraft(next)
      setHistoryIndex(0)
      setSaveState('saved')
      return
    }
    if (!dirtyRef.current && !savingRef.current) {
      const next = structuredClone(options.production)
      const index = historyIndexRef.current
      const isSaveAcknowledgement =
        productionFingerprint(next) === productionFingerprint(draftRef.current)
      draftRef.current = next
      if (isSaveAcknowledgement) {
        historyRef.current[index] = structuredClone(next)
      } else {
        historyRef.current = historyRef.current.slice(0, index + 1)
        historyRef.current[index] = structuredClone(next)
      }
      setDraft(next)
      setSaveState('saved')
    }
  }, [options.production])

  React.useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    },
    []
  )

  function scheduleSave() {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      void flushRef.current()
    }, options.debounceMs ?? 900)
  }

  function markDraft(next: ProductionView, pushHistory: boolean) {
    const cloned = structuredClone(next)
    draftRef.current = cloned
    versionRef.current += 1
    dirtyRef.current = true
    if (savingRef.current) queuedRef.current = true
    if (pushHistory) {
      const nextHistory = historyRef.current
        .slice(0, historyIndexRef.current + 1)
        .concat(structuredClone(cloned))
        .slice(-50)
      historyRef.current = nextHistory
      historyIndexRef.current = nextHistory.length - 1
      setHistoryIndex(historyIndexRef.current)
    }
    setDraft(cloned)
    setSaveState('dirty')
    scheduleSave()
  }

  function change(next: ProductionView) {
    markDraft(next, true)
  }

  function undo() {
    if (historyIndexRef.current <= 0) return
    const nextIndex = historyIndexRef.current - 1
    historyIndexRef.current = nextIndex
    setHistoryIndex(nextIndex)
    markDraft(historyRef.current[nextIndex], false)
  }

  function redo() {
    if (historyIndexRef.current >= historyRef.current.length - 1) return
    const nextIndex = historyIndexRef.current + 1
    historyIndexRef.current = nextIndex
    setHistoryIndex(nextIndex)
    markDraft(historyRef.current[nextIndex], false)
  }

  async function flush(forceVersion = false): Promise<boolean> {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (forceVersion) forceVersionRef.current = true
    if (savingRef.current) {
      queuedRef.current = true
      return savePromiseRef.current ?? true
    }
    if (!dirtyRef.current && !forceVersionRef.current) return true

    savingRef.current = true
    const run = (async () => {
      let success = true
      do {
        queuedRef.current = false
        const version = versionRef.current
        const snapshot = structuredClone(draftRef.current)
        const isVersionSave = forceVersionRef.current
        forceVersionRef.current = false
        setSaveState('saving')
        success = await commitRef.current(
          snapshot,
          isVersionSave
            ? summariesRef.current.version
            : summariesRef.current.autosave,
          { silent: !isVersionSave }
        )
        if (!success) {
          dirtyRef.current = true
          setSaveState('error')
          return false
        }
        if (versionRef.current === version) {
          dirtyRef.current = false
          setSaveState('saved')
        } else {
          dirtyRef.current = true
          queuedRef.current = true
          setSaveState('dirty')
        }
      } while (queuedRef.current || forceVersionRef.current)
      return success
    })()
    savePromiseRef.current = run
    try {
      return await run
    } finally {
      savingRef.current = false
      savePromiseRef.current = null
    }
  }

  flushRef.current = flush

  return {
    draft,
    saveState,
    canUndo: historyIndex > 0,
    canRedo: historyIndex < historyRef.current.length - 1,
    change,
    undo,
    redo,
    flush,
    retry: () => flush()
  }
}

function productionIdentity(production: ProductionView) {
  return [
    production.episodes[0]?.id ?? 'no-episode',
    production.scenes[0]?.id ?? 'no-scene'
  ].join(':')
}

function productionFingerprint(production: ProductionView) {
  return JSON.stringify({
    episodes: production.episodes,
    scenes: production.scenes,
    counts: production.counts
  })
}
