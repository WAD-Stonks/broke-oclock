import { join } from 'node:path'
import { repositoryRoot } from '@scripts/environment'
import { buildNodeApi } from '@scripts/node-api-build'

await buildNodeApi('server', join(repositoryRoot, 'apps/api/dist'))
console.info('Built standalone Node API; run node apps/api/dist/server.js.')
