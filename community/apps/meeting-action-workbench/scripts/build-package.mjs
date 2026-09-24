import { join } from 'node:path'
import { packageRoot, requireFromPackage, runNode } from './process-utils.mjs'

runNode(join(packageRoot, 'scripts', 'build-shared-ui.mjs'))
runNode(requireFromPackage.resolve('typescript/bin/tsc'), ['-p', join(packageRoot, 'tsconfig.remote.json'), '--noEmit'])
runNode(join(packageRoot, 'scripts', 'build-remote-components.mjs'))
runNode(requireFromPackage.resolve('typescript/bin/tsc'), ['-p', join(packageRoot, 'tsconfig.lib.json')])
runNode(join(packageRoot, 'scripts', 'copy-assets.mjs'))
runNode(join(packageRoot, 'scripts', 'verify-dist.mjs'))
