const ReactGlobal = (window as any).React

export const Fragment = ReactGlobal.Fragment
export function jsx(type: any, props: any, key?: any) {
  return ReactGlobal.createElement(type, key === undefined ? props : { ...props, key })
}
export const jsxs = jsx
export const jsxDEV = jsx
