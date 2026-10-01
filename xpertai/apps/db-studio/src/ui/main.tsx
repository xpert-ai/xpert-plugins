import { createRoot } from 'react-dom/client'
import { useStudio } from './controller'
import { Workbench } from './workbench'
import '@xpert-ai/plugin-shadcn-ui/style.css'
import './styles.css'
function App() {
  const state = useStudio()
  return <Workbench {...state} />
}
createRoot(document.getElementById('root')!).render(<App />)
