const ReactDOMGlobal = (window as typeof window & { ReactDOM?: typeof import('react-dom/client') }).ReactDOM
if (!ReactDOMGlobal) throw new Error('ReactDOM global is unavailable.')
export const createRoot = ReactDOMGlobal.createRoot
export const hydrateRoot = ReactDOMGlobal.hydrateRoot
