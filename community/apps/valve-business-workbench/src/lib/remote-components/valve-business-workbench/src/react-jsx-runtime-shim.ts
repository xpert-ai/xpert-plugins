const ReactGlobal = window.React

export const Fragment = ReactGlobal.Fragment
export function jsx(type: React.ElementType, props: Record<string, unknown>, key?: React.Key) {
  return ReactGlobal.createElement(type, key === undefined ? props : { ...props, key })
}
export const jsxs = jsx
export const jsxDEV = jsx
