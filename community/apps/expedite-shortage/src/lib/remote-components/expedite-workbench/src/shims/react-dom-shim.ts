// 把 `react-dom` 指向宿主注入的 window.ReactDOM：shadcn 的对话框、下拉框用 createPortal 把弹层挂到 body 上
// 复用自 community/apps/material-identity-governance 的同名 shim（AGPL-3.0）
import type * as ReactDOMNamespace from 'react-dom'

const ReactDOMGlobal = window.ReactDOM as typeof ReactDOMNamespace
export default ReactDOMGlobal
export const createPortal = ReactDOMGlobal.createPortal
export const flushSync = ReactDOMGlobal.flushSync
