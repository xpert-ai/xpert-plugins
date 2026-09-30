import type * as ReactTypes from 'react'

/**
 * React 运行时垫片（Task 19 构建管线注入）
 *
 * 运行时值 = iframe 渲染壳（renderRemoteReactIframeHtml）内联的 React UMD 全局对象；
 * 编译期把类型绑到 @types/react 的模块命名空间，使 hooks 泛型调用（useState<T> 等）
 * 通过类型检查。import type 会被 esbuild 整体擦除，不改变运行时行为。
 */
const ReactGlobal = (window as unknown as { React: typeof ReactTypes }).React

export default ReactGlobal
export const Children = ReactGlobal.Children
export const Component = ReactGlobal.Component
export const Fragment = ReactGlobal.Fragment
export const Profiler = ReactGlobal.Profiler
export const PureComponent = ReactGlobal.PureComponent
export const StrictMode = ReactGlobal.StrictMode
export const Suspense = ReactGlobal.Suspense
export const cloneElement = ReactGlobal.cloneElement
export const createContext = ReactGlobal.createContext
export const createElement = ReactGlobal.createElement
export const createFactory = ReactGlobal.createFactory
export const createRef = ReactGlobal.createRef
export const forwardRef = ReactGlobal.forwardRef
export const isValidElement = ReactGlobal.isValidElement
export const lazy = ReactGlobal.lazy
export const memo = ReactGlobal.memo
export const startTransition = ReactGlobal.startTransition
export const useCallback = ReactGlobal.useCallback
export const useContext = ReactGlobal.useContext
export const useDebugValue = ReactGlobal.useDebugValue
export const useDeferredValue = ReactGlobal.useDeferredValue
export const useEffect = ReactGlobal.useEffect
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

