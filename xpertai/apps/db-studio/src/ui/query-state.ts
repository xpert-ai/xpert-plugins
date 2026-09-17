import { cleanTarget, type Draft, type Run, type Target } from './model.js'

export function retargetDraft(draft: Draft, target: Target): Draft {
  if (JSON.stringify(cleanTarget(draft.target)) === JSON.stringify(cleanTarget(target))) return { ...draft, target }
  return { ...draft, target, run: undefined, explainRun: undefined, runningId: undefined, queryError: undefined }
}
export function beginQuery(drafts: Draft[], key: string, id: string, previousId?: string): Draft[] {
  return drafts.map((draft) => draft.key === key && (!previousId || draft.runningId === previousId)
    ? { ...draft, runningId: id, queryError: undefined } : draft)
}
export function receiveQuery(drafts: Draft[], key: string, id: string, mode: 'query' | 'explain', run: Run): Draft[] {
  return drafts.map((draft) => draft.key === key && draft.runningId === id
    ? { ...draft, [mode === 'explain' ? 'explainRun' : 'run']: run }
    : draft)
}
export function endQuery(drafts: Draft[], key: string, id: string, error?: string): Draft[] {
  return drafts.map((draft) => draft.key === key && draft.runningId === id
    ? { ...draft, runningId: undefined, queryError: error }
    : draft)
}
