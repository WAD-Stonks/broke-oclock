import { fileURLToPath } from 'node:url'
import { loadEnvironment } from './environment'

const root = fileURLToPath(new URL('../', import.meta.url))
const children = ['apps/api', 'apps/web'].map((directory) =>
  Bun.spawn(['bun', 'run', 'dev'], {
    cwd: `${root}${directory}`,
    env: loadEnvironment(),
    stdout: 'inherit',
    stderr: 'inherit',
  }),
)
let stopping = false
const stop = () => {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill('SIGTERM')
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
const code = await Promise.race(children.map((child) => child.exited))
stop()
await Promise.all(children.map((child) => child.exited))
process.exitCode = code
