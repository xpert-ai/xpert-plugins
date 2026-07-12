import { rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))

// TypeScript does not remove outputs for deleted source files, so every package build starts clean.
rmSync(join(packageRoot, 'dist'), { recursive: true, force: true })
