/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent
  export default component
}

declare module 'pencil-cjk-font-chunks' {
  export const CJK_FONT_CHUNK_URLS: string[]
}
