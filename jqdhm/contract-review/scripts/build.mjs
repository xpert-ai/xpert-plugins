import { cp, copyFile, mkdir } from 'node:fs/promises'

await mkdir(new URL('../dist/remote/', import.meta.url), { recursive: true })
await cp(new URL('../src/remote/', import.meta.url), new URL('../dist/remote/', import.meta.url), { recursive: true })
await copyFile(new URL('../assistant.yaml', import.meta.url), new URL('../dist/assistant.yaml', import.meta.url))
