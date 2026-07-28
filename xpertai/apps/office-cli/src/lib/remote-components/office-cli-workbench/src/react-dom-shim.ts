const ReactDOMGlobal = (window as typeof window & { ReactDOM?: typeof import('react-dom') }).ReactDOM
if (!ReactDOMGlobal) throw new Error('ReactDOM global is unavailable.')
export const createPortal = ReactDOMGlobal.createPortal
export const flushSync = ReactDOMGlobal.flushSync
export default ReactDOMGlobal
