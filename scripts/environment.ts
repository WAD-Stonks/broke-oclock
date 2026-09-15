import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'

export const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
export const loadEnvironment = (): NodeJS.ProcessEnv => {
  const path = new URL('../.env', import.meta.url)
  const file = existsSync(path) ? parseEnv(readFileSync(path, 'utf8')) : {}
  return { ...file, ...process.env }
}
