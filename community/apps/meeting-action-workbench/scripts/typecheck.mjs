import { join } from 'node:path'
import { packageRoot, runNode, runTsc } from './process-utils.mjs'

runNode(join(packageRoot, 'scripts', 'build-shared-ui.mjs'))
if (!process.argv.includes('--remote-only')) runTsc('tsconfig.spec.json')
runTsc('tsconfig.remote.json')
