import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { repositoryRoot } from '@scripts/environment'
import { buildNodeApi } from '@scripts/node-api-build'

const output = join(repositoryRoot, 'apps/api/.vercel/output')
const functionDirectory = join(output, 'functions/api.func')
// Only replace generated output, never source or local configuration.
await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })
await buildNodeApi('vercel', functionDirectory)
await writeFile(
  join(functionDirectory, '.vc-config.json'),
  JSON.stringify({
    runtime: 'nodejs22.x',
    architecture: 'x86_64',
    handler: 'index.mjs',
    launcherType: 'Nodejs',
    shouldAddHelpers: true,
  }),
)
await writeFile(
  join(output, 'config.json'),
  JSON.stringify({
    version: 3,
    routes: [
      {
        src: '/(.*)',
        dest: '/api',
        transforms: [{ type: 'request.path', op: 'set', args: '/$1' }],
      },
    ],
  }),
)
console.info('Built self-contained Node API function; no deployment or database push performed.')
