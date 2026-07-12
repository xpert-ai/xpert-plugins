const DEBUG_KEY = 'xpert.debug.pencil-workbench'

let hostDebugEnabled = false

export function setPencilDebugHostConfig(value: unknown) {
  hostDebugEnabled = Boolean(value && typeof value === 'object' && Reflect.get(value, 'pencil-workbench') === true)
}

export function pencilWorkbenchDebug(...args: unknown[]) {
  if (!isDebugEnabled()) {
    return
  }
  console.debug('[PencilWorkbench]', ...args)
}

function isDebugEnabled() {
  const params = new URLSearchParams(window.location.search)
  const queryValue = params.get('xpertDebug')
  if (queryValue === '0' || queryValue === 'false') {
    return false
  }
  if (queryValue === 'pencil-workbench' || queryValue === '1' || queryValue === 'true') {
    return true
  }
  return hostDebugEnabled || window.localStorage.getItem(DEBUG_KEY) === '1'
}
