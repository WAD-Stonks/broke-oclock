import { mkdirSync } from 'node:fs'
import { createConnection } from 'node:net'
import { fileURLToPath } from 'node:url'
import { MongoMemoryReplSet } from 'mongodb-memory-server'

// Local-only single-member replica set. Never connect this helper to cloud data.
const port = 27017
const inUse = await new Promise<boolean>((resolve) => {
  const socket = createConnection({ host: '127.0.0.1', port })
  socket.once('connect', () => {
    socket.destroy()
    resolve(true)
  })
  socket.once('error', () => {
    socket.destroy()
    resolve(false)
  })
})
if (inUse)
  throw new Error(
    'Port 27017 is already in use. Stop your own local MongoDB or use its replica-set URL; no existing process was changed.',
  )
const directory = fileURLToPath(new URL('../.local/mongodb/', import.meta.url))
mkdirSync(directory, { recursive: true })
const database = await MongoMemoryReplSet.create({
  instanceOpts: [{ port, dbPath: directory }],
  replSet: { count: 1, name: 'rs0', ip: '127.0.0.1', storageEngine: 'wiredTiger' },
})
console.info(
  'Local-only MongoDB replica set listening on 127.0.0.1:27017. Data: .local/mongodb (ignored).',
)
console.info('Keep this terminal open. Ctrl+C stops MongoDB without deleting your local database.')
let stopping = false
const stop = async () => {
  if (stopping) return
  stopping = true
  await database.stop({ doCleanup: false })
}
process.on('SIGINT', () => {
  void stop()
})
process.on('SIGTERM', () => {
  void stop()
})
