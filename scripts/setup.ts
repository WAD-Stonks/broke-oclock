import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const target = new URL('.env', root)
if (existsSync(target)) {
  console.info('Existing .env retained; no values changed.')
} else {
  const template = readFileSync(new URL('.env.example', root), 'utf8')
  writeFileSync(
    target,
    template.replace(
      'BETTER_AUTH_SECRET=',
      `BETTER_AUTH_SECRET=${randomBytes(32).toString('hex')}`,
    ),
    { mode: 0o600, flag: 'wx' },
  )
  console.info(`Created local configuration at ${fileURLToPath(target)}. Secret is not printed.`)
}
