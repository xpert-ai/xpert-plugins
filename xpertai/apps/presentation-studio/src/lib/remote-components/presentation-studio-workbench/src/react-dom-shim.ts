import type * as ReactDOMNamespace from 'react-dom'
function readGlobal<T>(key: string): T { return Reflect.get(window, key) as T }
const ReactDOMGlobal = readGlobal<typeof ReactDOMNamespace>('ReactDOM')
export default ReactDOMGlobal
export const createPortal = ReactDOMGlobal.createPortal
export const flushSync = ReactDOMGlobal.flushSync
export const unstable_batchedUpdates = ReactDOMGlobal.unstable_batchedUpdates
