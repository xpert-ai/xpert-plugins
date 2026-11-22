// The React 18 UMD build exposes createRoot on the ReactDOM global.
const ReactDOMClientGlobal = window.ReactDOM

export const createRoot = ReactDOMClientGlobal.createRoot
export const hydrateRoot = ReactDOMClientGlobal.hydrateRoot
