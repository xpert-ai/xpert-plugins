import { createRoot } from 'react-dom/client'
import '@xpert-ai/plugin-shadcn-ui/style.css'
import '../../../../../ui/styles.css'
import { MapsApp } from '../../../../../ui/App'
import { createWorkbenchTransport } from '../../../../../ui/transports/workbench'
const root = document.getElementById('root')
if (!root) throw new Error('Maps root is missing')
createRoot(root).render(<MapsApp transport={createWorkbenchTransport()} />)
