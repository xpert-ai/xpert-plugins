const ReactDOMGlobal = window.ReactDOM as typeof import('react-dom') & Partial<typeof import('react-dom/client')>

export const createRoot = ReactDOMGlobal.createRoot
export const hydrateRoot = ReactDOMGlobal.hydrateRoot
