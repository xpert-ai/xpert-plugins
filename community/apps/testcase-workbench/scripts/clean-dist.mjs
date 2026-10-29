// Remove only this package's generated output so retired modules cannot ship.
import { rm } from 'node:fs/promises'
await rm(new URL('../dist/', import.meta.url), { recursive: true, force: true })
