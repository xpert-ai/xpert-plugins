import type { Key } from 'react'
import type * as JsxRuntime from 'react/jsx-runtime'

const ReactGlobal = window.React
const create: typeof JsxRuntime.jsx = (type, props, key) =>
  ReactGlobal.createElement(type, normalizeProps(props, key))

function normalizeProps(props: unknown, key?: Key): Record<string, unknown> | null {
  const record = props && typeof props === 'object' && !Array.isArray(props) ? props as Record<string, unknown> : {}
  return key === undefined ? record : { ...record, key }
}

export const Fragment = ReactGlobal.Fragment
export const jsx = create
export const jsxs: typeof JsxRuntime.jsxs = create
export const jsxDEV = create
