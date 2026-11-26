import { createRoot } from 'react-dom/client'
import { RemoteI18nProvider } from '@xpert-ai/plugin-shadcn-ui/i18n'
import { installShadcnThemeVars } from '@xpert-ai/plugin-shadcn-ui/theme'
import { connect } from './bridge'
import { i18n, t } from './i18n'
import { Workbench } from './workbench'
import './styles.css'

const container = document.getElementById('root')
if (!container) throw Error('workbench_root_missing')
const root = createRoot(container)
root.render(<p role="status">{t('connecting')}</p>)
const disconnect = connect((session, init, bridge) => {
  i18n.setLocale(init.locale)
  document.documentElement.classList.toggle('dark', init.theme?.mode === 'dark')
  installShadcnThemeVars()
  root.render(
    <RemoteI18nProvider i18n={i18n}>
      <Workbench key={session} bridge={bridge} />
    </RemoteI18nProvider>
  )
})
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) disconnect()
})
