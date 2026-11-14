import { mkdir, writeFile } from 'node:fs/promises'
import { templates } from '../dist/template.js'
await mkdir(new URL('../templates/', import.meta.url), { recursive: true })
await writeFile(new URL('../templates/manufacturing-assistant.yaml', import.meta.url), templates[0].dslContent + '\n')
