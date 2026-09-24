export const React: typeof import('react') = window.React
export const ReactDOM: typeof import('react-dom') & {
  createRoot?: (container: Element | DocumentFragment | null) => { render(node: import('react').ReactNode): void }
} = window.ReactDOM

