declare const React: typeof import('react')

export function Icon({ name }: { name: string }) {
  const path = iconPath(name)
  return (
    <svg className="crm20-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {path}
    </svg>
  )
}

function iconPath(name: string) {
  switch (name) {
    case 'home':
      return <path d="M4 11.4 12 5l8 6.4v7.1a1.5 1.5 0 0 1-1.5 1.5H15v-5.5H9V20H5.5A1.5 1.5 0 0 1 4 18.5v-7.1Z" />
    case 'message':
      return <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v6A2.5 2.5 0 0 1 16.5 15H10l-4.2 3v-3.4A2.5 2.5 0 0 1 5 12.5v-6Z" />
    case 'message-plus':
      return (
        <>
          <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v6A2.5 2.5 0 0 1 16.5 15H10l-4.2 3v-3.4A2.5 2.5 0 0 1 5 12.5v-6Z" />
          <path d="M12 7.5v4M10 9.5h4" />
        </>
      )
    case 'building':
      return <path d="M6 20V5.5A1.5 1.5 0 0 1 7.5 4h9A1.5 1.5 0 0 1 18 5.5V20M4.5 20h15M9 8h2M13 8h2M9 11h2M13 11h2M9 14h2M13 14h2" />
    case 'person':
      return <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 20a7 7 0 0 1 14 0" />
    case 'target':
      return <path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 12h8" />
    case 'check':
      return <path d="M5 12.5 9.2 17 19 7" />
    case 'note':
      return <path d="M7 4h7l3 3v13H7V4ZM14 4v4h4M9.5 12h5M9.5 15h5" />
    case 'grid':
      return <path d="M5 5h5v5H5V5ZM14 5h5v5h-5V5ZM5 14h5v5H5v-5ZM14 14h5v5h-5v-5Z" />
    case 'workflow':
      return <path d="M6 7h5M13 7h5M6 17h5M13 17h5M11 7v10M13 7v10" />
    case 'search':
      return <path d="m16.5 16.5 3.5 3.5M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
    case 'list':
      return <path d="M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01" />
    case 'plus':
      return <path d="M12 5v14M5 12h14" />
    case 'refresh':
      return <path d="M19 8a7 7 0 0 0-12.1-2.8L5 7M5 4v3h3M5 16a7 7 0 0 0 12.1 2.8L19 17M19 20v-3h-3" />
    case 'more':
      return <path d="M6 12h.01M12 12h.01M18 12h.01" />
    case 'chevron':
      return <path d="m8 10 4 4 4-4" />
    case 'close':
      return <path d="M6 6 18 18M18 6 6 18" />
    case 'save':
      return <path d="M6 4h10l2 2v14H6V4ZM9 4v6h6V4M9 17h6" />
    case 'edit':
      return <path d="M5 19h4l10-10-4-4L5 15v4ZM13.5 6.5l4 4" />
    case 'table':
      return <path d="M4 6h16v12H4V6ZM4 10h16M9 6v12M15 6v12" />
    case 'link':
      return <path d="M10 14a4 4 0 0 0 5.7 0l2.1-2.1a4 4 0 0 0-5.7-5.7L11 7.3M14 10a4 4 0 0 0-5.7 0l-2.1 2.1a4 4 0 0 0 5.7 5.7L13 16.7" />
    case 'mail':
      return <path d="M4 6h16v12H4V6ZM5 7l7 6 7-6" />
    case 'phone':
      return <path d="M8 5h3l1 4-2 1a9 9 0 0 0 4 4l1-2 4 1v3a2 2 0 0 1-2 2A11 11 0 0 1 6 7a2 2 0 0 1 2-2Z" />
    case 'calendar':
      return <path d="M7 4v3M17 4v3M5 8h14M6 6h12a1 1 0 0 1 1 1v12H5V7a1 1 0 0 1 1-1Z" />
    case 'money':
      return <path d="M4 7h16v10H4V7ZM7 10h.01M17 14h.01M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
    case 'hash':
      return <path d="M9 4 7 20M17 4l-2 16M5 9h14M4 15h14" />
    default:
      return <path d="M5 5h14v14H5V5Z" />
  }
}
