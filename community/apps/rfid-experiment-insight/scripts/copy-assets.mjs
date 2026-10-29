import { copyFile, cp } from 'node:fs/promises'
await copyFile(new URL('../src/xpert-rfid-experiment-insight-assistant.yaml', import.meta.url), new URL('../dist/xpert-rfid-experiment-insight-assistant.yaml', import.meta.url))
await cp(new URL('../src/lib/remote-components/', import.meta.url), new URL('../dist/lib/remote-components/', import.meta.url), { recursive: true })
