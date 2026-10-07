import { copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { repositoryRoot } from '@scripts/environment'
import { build } from 'esbuild'

export const buildNodeApi = async (entry: 'server' | 'vercel', directory: string) => {
  const generated = join(repositoryRoot, 'packages/db/src/generated/prisma')
  const files = await readdir(generated)
  if (!files.includes('libquery_engine-rhel-openssl-3.0.x.so.node'))
    throw new Error('Run db:generate before building the Node API')
  await rm(directory, { recursive: true, force: true })
  await mkdir(directory, { recursive: true })
  await build({
    absWorkingDir: repositoryRoot,
    entryPoints: [join(repositoryRoot, `apps/api/src/${entry}.ts`)],
    outfile: join(directory, entry === 'server' ? 'server.js' : 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: 'node22.18',
    format: 'esm',
    tsconfig: join(repositoryRoot, 'tsconfig.json'),
    // CommonJS dependencies require Node builtins and Prisma's adjacent native engine.
    // Preserve ESM import.meta for UploadThing and the server entry-point guard.
    banner: {
      js: "import { createRequire as __nodeCreateRequire } from 'node:module'; import { fileURLToPath as __nodeFileURLToPath } from 'node:url'; import { dirname as __nodeDirname } from 'node:path'; const require = __nodeCreateRequire(import.meta.url); const __filename = __nodeFileURLToPath(import.meta.url); const __dirname = __nodeDirname(__filename);",
    },
  })
  for (const file of files) {
    if (file === 'schema.prisma' || (file.startsWith('libquery_engine-') && file.endsWith('.node')))
      await copyFile(join(generated, file), join(directory, file))
  }
  // dist/server.js must remain ESM even when copied outside the monorepo.
  await writeFile(
    join(directory, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }),
  )
}
