import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, relative } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = (path) => readFileSync(join(root, path), 'utf8')
const manifest = (path) => JSON.parse(read(`${path}/package.json`))
const workspaces = ['apps', 'packages'].flatMap((parent) =>
  readdirSync(join(root, parent))
    .map((name) => `${parent}/${name}`)
    .filter((path) => existsSync(join(root, path, 'package.json'))),
)
const packageOwners = new Map(workspaces.map((path) => [manifest(path).name, path]))
const privateOwners = new Map(
  Object.entries(JSON.parse(read('tsconfig.json')).compilerOptions.paths)
    .filter(([alias]) => !alias.startsWith('@broke-oclock/'))
    .map(([alias, [target]]) => [
      alias.replace('*', ''),
      target.replace(/^\.\//, '').split('/').slice(0, 2).join('/'),
    ]),
)

const sourceFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return ['node_modules', 'generated', 'dist', '.vercel', 'coverage'].includes(entry.name)
        ? []
        : sourceFiles(path)
    }
    return /\.(?:ts|tsx|vue|mjs)$/.test(entry.name) ? [path] : []
  })

const importedModules = (path) => {
  const text = readFileSync(path, 'utf8')
  const scripts = path.endsWith('.vue')
    ? [...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1]).join('\n')
    : text
  const source = ts.createSourceFile(path, scripts, ts.ScriptTarget.Latest, true)
  const imports = []
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      imports.push(node.moduleSpecifier.text)
    }
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      imports.push(node.arguments[0].text)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return imports
}

test('workspace imports preserve app isolation, package ownership and public exports including tests', () => {
  const violations = []
  for (const owner of workspaces) {
    for (const path of sourceFiles(join(root, owner))) {
      for (const specifier of importedModules(path)) {
        const privateOwner = [...privateOwners].find(([prefix]) =>
          specifier.startsWith(prefix),
        )?.[1]
        const packageName = specifier.match(/^@broke-oclock\/[^/]+/)?.[0]
        const publicOwner = packageOwners.get(packageName)
        const targetOwner = privateOwner ?? publicOwner
        const location = `${relative(root, path)} -> ${specifier}`
        if (privateOwner && privateOwner !== owner)
          violations.push(`${location}: private source alias outside its owner`)
        if (targetOwner?.startsWith('apps/') && targetOwner !== owner)
          violations.push(`${location}: app implementation outside its owner`)
        if (publicOwner) {
          const exports = manifest(publicOwner).exports
          const subpath =
            specifier === packageName ? '.' : `.${specifier.slice(packageName.length)}`
          if (
            typeof exports === 'string' ? subpath !== '.' : !Object.hasOwn(exports ?? {}, subpath)
          )
            violations.push(`${location}: undeclared public export`)
        }
      }
    }
  }
  assert.deepEqual(violations, [])
})

test('public contract resolution agrees between TypeScript and Node and rejects private subpaths', () => {
  for (const importer of [
    join(root, 'apps/api/src/rest/root.ts'),
    join(root, 'e2e/platform-admin.spec.ts'),
  ]) {
    const require = createRequire(importer)
    const options = ts.parseJsonConfigFileContent(JSON.parse(read('tsconfig.json')), ts.sys, root, {
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    }).options
    for (const subpath of ['api', 'ingestion', 'platform-admin']) {
      const specifier = `@broke-oclock/contracts/${subpath}`
      const resolved = ts.resolveModuleName(specifier, importer, options, ts.sys).resolvedModule
      assert.ok(resolved, `TypeScript must resolve ${specifier}`)
      assert.equal(
        realpathSync(resolved.resolvedFileName),
        realpathSync(require.resolve(specifier)),
      )
    }
    for (const subpath of ['query', 'rpc', 'not-exported']) {
      const specifier = `@broke-oclock/contracts/${subpath}`
      assert.equal(
        ts.resolveModuleName(specifier, importer, options, ts.sys).resolvedModule,
        undefined,
      )
      assert.throws(() => require.resolve(specifier), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' })
    }
  }
})
