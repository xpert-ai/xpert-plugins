const ReactGlobal = (window as typeof window & { React?: typeof import('react') }).React
if (!ReactGlobal) throw new Error('React global is unavailable.')
export const Children = ReactGlobal.Children
export const Fragment = ReactGlobal.Fragment
export const createElement = ReactGlobal.createElement
export const h = ReactGlobal.createElement
export const useCallback = ReactGlobal.useCallback
export const useEffect = ReactGlobal.useEffect
export const useMemo = ReactGlobal.useMemo
export const useRef = ReactGlobal.useRef
export const useState = ReactGlobal.useState
export default ReactGlobal
