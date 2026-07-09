import type * as ReactNamespace from 'react'
import type * as ReactJsxDevRuntime from 'react/jsx-dev-runtime'
import type * as ReactJsxRuntime from 'react/jsx-runtime'

type JsxInputProps = Parameters<typeof ReactJsxRuntime.jsx>[1]
type JsxPropValue = object | string | number | boolean | symbol | bigint | null | undefined
type JsxProps = (ReactNamespace.Attributes & Record<string, JsxPropValue>) | null

function readWindowGlobal<T>(key: 'React'): T {
  return window[key as keyof Window] as T
}

const ReactGlobal = readWindowGlobal<typeof ReactNamespace>('React')
const createElement: (
  type: ReactNamespace.ElementType,
  props: JsxProps
) => ReactNamespace.ReactElement = ReactGlobal.createElement

function isPropsObject(value: JsxInputProps): value is Record<string, JsxPropValue> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizeProps(props: JsxInputProps, key?: ReactNamespace.Key): JsxProps {
  if (key === undefined) {
    return isPropsObject(props) ? props : null
  }

  return {
    ...(isPropsObject(props) ? props : {}),
    key
  }
}

export const Fragment: typeof ReactJsxRuntime.Fragment = ReactGlobal.Fragment
export const jsx: typeof ReactJsxRuntime.jsx = (type, props, key) => {
  return createElement(type, normalizeProps(props, key))
}
export const jsxs: typeof ReactJsxRuntime.jsxs = jsx
export const jsxDEV: typeof ReactJsxDevRuntime.jsxDEV = (type, props, key) => {
  return createElement(type, normalizeProps(props, key))
}
