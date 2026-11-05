import messages from './locales/zh-Hans.json'
export type MessageKey = keyof typeof messages
export function t(key: MessageKey, values: { [key: string]: string | number } = {}): string {
  return messages[key].replace(/\{(\w+)\}/g, (_match, name: string) => String(values[name] ?? ''))
}
export function formatMoney(value: string) {
  const [whole, decimal = '00'] = value.split('.')
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${decimal}`
}
export function formatDateTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(date)
}
