declare module '*.ttf' {
  const url: string
  export default url
}

declare module '*.svg' {
  const source: string
  export default source
}

declare module 'pencil-cjk-font-chunks' {
  export const CJK_FONT_CHUNK_URLS: readonly string[]
}
