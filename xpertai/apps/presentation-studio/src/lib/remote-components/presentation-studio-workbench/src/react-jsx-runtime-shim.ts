import type * as ReactNamespace from 'react'
function readGlobal<T>(key: string): T { return Reflect.get(window, key) as T }
const ReactGlobal = readGlobal<typeof ReactNamespace>('React')
export const Fragment = ReactGlobal.Fragment

type AutomaticJsxFactory = (
  type: ReactNamespace.ElementType,
  props: Record<string, unknown> | null,
  key?: ReactNamespace.Key
) => ReactNamespace.ReactElement

const createAutomaticJsxElement: AutomaticJsxFactory = (type, props, key) => ReactGlobal.createElement(
  type,
  key === undefined ? props : { ...props, key }
)

export const jsx = createAutomaticJsxElement
export const jsxs = createAutomaticJsxElement
export const jsxDEV = createAutomaticJsxElement
export const h = ReactGlobal.createElement
