import { join } from 'node:path'
import { loadEnvironment, repositoryRoot } from '@scripts/environment'
import { runCommands } from '@scripts/processes'

const [workspace, ...args] = process.argv.slice(2)
if (!workspace || args.length === 0) throw new Error('Usage: workspace.ts <workspace> <script>')
process.exitCode = await runCommands([
  {
    command: 'pnpm',
    args: ['run', ...args],
    cwd: join(repositoryRoot, workspace),
    env: loadEnvironment(),
  },
])
