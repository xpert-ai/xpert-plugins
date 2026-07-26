import { requireReactGlobal } from './runtime-globals.js'

const ReactGlobal = requireReactGlobal()

export default ReactGlobal
export const createContext = ReactGlobal.createContext
export const createElement = ReactGlobal.createElement
export const Fragment = ReactGlobal.Fragment
export const forwardRef = ReactGlobal.forwardRef
export const memo = ReactGlobal.memo
export const useCallback = ReactGlobal.useCallback
export const useContext = ReactGlobal.useContext
export const useEffect = ReactGlobal.useEffect
export const useMemo = ReactGlobal.useMemo
export const useRef = ReactGlobal.useRef
export const useState = ReactGlobal.useState
