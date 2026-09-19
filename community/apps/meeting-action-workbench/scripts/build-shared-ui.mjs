import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { runNode, workspaceRoot } from './process-utils.mjs'

const uiRoot = join(workspaceRoot, 'packages', 'shadcn-ui')
const requireFromUi = createRequire(join(uiRoot, 'package.json'))

runNode(join(dirname(requireFromUi.resolve('vite/package.json')), 'bin', 'vite.js'), ['build'], uiRoot)
runNode(requireFromUi.resolve('typescript/bin/tsc'), ['-p', join(uiRoot, 'tsconfig.lib.json'), '--emitDeclarationOnly'], uiRoot)
