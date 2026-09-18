import { rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

// A stale dist can hide a deleted source file from the host, so every build starts clean.
await rm(fileURLToPath(new URL('../dist', import.meta.url)), { recursive: true, force: true })
