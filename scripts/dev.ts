import { join } from 'node:path'
import { loadEnvironment, repositoryRoot } from '@scripts/environment'
import { runCommands } from '@scripts/processes'

const env = loadEnvironment()
process.exitCode = await runCommands(
  ['apps/api', 'apps/web'].map((directory) => ({
    command: 'pnpm',
    args: ['run', 'dev'],
    cwd: join(repositoryRoot, directory),
    env,
  })),
)
