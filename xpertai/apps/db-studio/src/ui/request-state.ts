import type { Plan } from './model.js'

// Each request channel has its own sequence; connection changes also invalidate object requests.
export function latestRequest() {
  let sequence = 0
  return {
    begin: () => ++sequence,
    isCurrent: (request: number) => request === sequence,
  }
}

export function refreshSelectedPlan(selected: Plan | null, response: Plan): Plan | null {
  return selected?.id === response.id && response.revision >= selected.revision ? response : selected
}
