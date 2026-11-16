import { i18n } from './i18n'
import { React } from './vendor'

export function LoadingState() {
  return <div role="status" aria-live="polite"
    className="flex min-h-64 flex-1 items-center justify-center text-center text-sm text-muted-foreground">
    {i18n.t('loading')}
  </div>
}
