import type * as ReactNamespace from 'react'

const ReactGlobal = Reflect.get(window, 'React') as typeof ReactNamespace
export default ReactGlobal
export const Children = ReactGlobal.Children
export const Component = ReactGlobal.Component
export const Fragment = ReactGlobal.Fragment
export const Profiler = ReactGlobal.Profiler
export const PureComponent = ReactGlobal.PureComponent
export const createContext = ReactGlobal.createContext
export const createElement = ReactGlobal.createElement
export const createFactory = ReactGlobal.createFactory
export const createRef = ReactGlobal.createRef
export const cloneElement = ReactGlobal.cloneElement
export const forwardRef = ReactGlobal.forwardRef
export const isValidElement = ReactGlobal.isValidElement
export const lazy = ReactGlobal.lazy
export const memo = ReactGlobal.memo
export const startTransition = ReactGlobal.startTransition
export const useCallback = ReactGlobal.useCallback
export const useContext = ReactGlobal.useContext
export const useEffect = ReactGlobal.useEffect
export const useDebugValue = ReactGlobal.useDebugValue
export const useDeferredValue = ReactGlobal.useDeferredValue
export const useId = ReactGlobal.useId
export const useImperativeHandle = ReactGlobal.useImperativeHandle
export const useInsertionEffect = ReactGlobal.useInsertionEffect
export const useLayoutEffect = ReactGlobal.useLayoutEffect
export const useMemo = ReactGlobal.useMemo
export const useReducer = ReactGlobal.useReducer
export const useRef = ReactGlobal.useRef
export const useState = ReactGlobal.useState
export const useSyncExternalStore = ReactGlobal.useSyncExternalStore
export const useTransition = ReactGlobal.useTransition
export const version = ReactGlobal.version
