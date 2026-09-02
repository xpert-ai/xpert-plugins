import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pipelinePreview, { platformRoot } from '../factory-operations-center/preview.config.mjs'

const componentRoot = dirname(fileURLToPath(import.meta.url))

export { platformRoot }

export default {
  ...pipelinePreview,
  title: 'Factory Case Workspace · Remote View Preview',
  frameTitle: 'Factory Case Workspace',
  instanceId: 'factory-case-workspace-preview',
  component: { root: componentRoot, runtime: 'react', title: 'Factory Case Workspace' },
  hostContext: {
    ...pipelinePreview.hostContext,
    manifest: { key: 'factory-case-workspace' },
    initialQuery: {
      page: 1,
      pageSize: 20,
      selectionId: '00000000-0000-4000-8000-000000000070',
      parameters: {
        caseId: '00000000-0000-4000-8000-000000000070',
        nodeKey: 'verify-recovery'
      }
    }
  },
  state: {
    ...structuredClone(pipelinePreview.state),
    stage: 3,
    navigation: null
  }
}
