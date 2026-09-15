import { copyFile, mkdir, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = join(root, 'apps/api/.vercel/output')
const functionDirectory = join(output, 'functions/api.func')
const generated = join(root, 'packages/db/src/generated/prisma')
const linuxEngine = 'libquery_engine-rhel-openssl-3.0.x.so.node'
const generatedFiles = await readdir(generated)
if (!generatedFiles.includes(linuxEngine))
  throw new Error('Run db:generate before building for Vercel')

// Only replace this script's generated output, never source or local configuration.
await rm(output, { recursive: true, force: true })
await mkdir(functionDirectory, { recursive: true })
const result = await Bun.build({
  entrypoints: [join(root, 'apps/api/src/vercel.ts')],
  target: 'node',
  format: 'esm',
  packages: 'bundle',
  outdir: functionDirectory,
  naming: 'index.mjs',
  env: 'disable',
})
if (!result.success) throw new AggregateError(result.logs, 'Vercel API bundle failed')

// Prisma resolves its schema/engine next to the bundled client. Include the local
// engine for isolated smoke tests and the explicit x86_64 Linux engine for Vercel.
for (const file of generatedFiles) {
  if (file === 'schema.prisma' || (file.startsWith('libquery_engine-') && file.endsWith('.node'))) {
    await copyFile(join(generated, file), join(functionDirectory, file))
  }
}
await Bun.write(
  join(functionDirectory, '.vc-config.json'),
  JSON.stringify({
    runtime: 'nodejs22.x',
    architecture: 'x86_64',
    handler: 'index.mjs',
    launcherType: 'Nodejs',
    shouldAddHelpers: true,
  }),
)
await Bun.write(
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
