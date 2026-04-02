export type LoopGuardFailureMode = 'continue' | 'end' | 'error'

export type LoopGuardRule = 'batch_repeat'

export const DEFAULT_VOLATILE_ARG_KEYS = [
  'id',
  'requestId',
  'traceId',
  'timestamp',
  'time',
  'nonce',
] as const

export const LoopGuardIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">
<path d="M23 31c6-11 17-18 29-18 10 0 19 4 26 10l7-8v22H63l9-10c-5-4-11-7-20-7-9 0-18 5-23 13" fill="currentColor"/>
<path d="M77 69c-6 11-17 18-29 18-10 0-19-4-26-10l-7 8V63h22l-9 10c5 4 11 7 20 7 9 0 18-5 23-13" fill="currentColor"/>
<path d="M51 34l3 9h9l-7 5 3 9-8-6-8 6 3-9-7-5h9l3-9z" fill="#FFF4E6"/>
<circle cx="50" cy="50" r="42" stroke="currentColor" stroke-width="4"/>
</svg>`
