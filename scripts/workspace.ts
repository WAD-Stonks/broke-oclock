import { join } from 'node:path'
import { loadEnvironment, repositoryRoot } from '@scripts/environment'

const [workspace, ...args] = process.argv.slice(2)
if (!workspace || args.length === 0) throw new Error('Usage: workspace.ts <workspace> <script>')
const child = Bun.spawn(['bun', 'run', ...args], {
  cwd: join(repositoryRoot, workspace),
  env: loadEnvironment(),
  stdout: 'inherit',
  stderr: 'inherit',
})
process.on('SIGINT', () => child.kill('SIGINT'))
process.on('SIGTERM', () => child.kill('SIGTERM'))
process.exitCode = await child.exited
