import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
export function loadJevCredentials() {
  const index = process.argv.indexOf('--env-file')
  if (index >= 0) {
    const file = process.argv[index + 1]
    if (!file) throw new Error('--env-file requires an existing local path')
    const env = parseEnv(readFileSync(file, 'utf8'))
    for (const key of ['TYPESAFE_API_KEY', 'TYPESAFE_MODEL']) if (env[key]) process.env[key] = env[key]
  }
}
