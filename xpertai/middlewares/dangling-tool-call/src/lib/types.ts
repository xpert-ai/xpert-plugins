export const DANGLING_TOOL_CALL_MIDDLEWARE_NAME = 'DanglingToolCallMiddleware'

export const DANGLING_TOOL_CALL_PLACEHOLDER_CONTENT =
  '[Tool call was interrupted and did not return a result.]'

export const DanglingToolCallIcon = `
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M7 7L3 12L7 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M17 7L21 12L17 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M10 19H14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M10 5H14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  <circle cx="12" cy="12" r="2.5" fill="currentColor"/>
</svg>
`
