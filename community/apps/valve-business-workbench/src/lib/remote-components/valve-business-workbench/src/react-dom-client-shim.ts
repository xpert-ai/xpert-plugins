const ReactDOMGlobal = window.ReactDOM

export const createRoot = ReactDOMGlobal.createRoot
export const hydrateRoot = (ReactDOMGlobal as typeof ReactDOMGlobal & { hydrateRoot?: unknown }).hydrateRoot
