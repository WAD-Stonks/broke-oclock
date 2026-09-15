import { PrismaClient } from './generated/prisma/index.js'

const globalForDb = globalThis as typeof globalThis & {
  __brokeOclockDb?: PrismaClient
}

export const db =
  globalForDb.__brokeOclockDb ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__brokeOclockDb = db
}

export type { Account, Session, User, Verification } from './generated/prisma/index.js'
export { PrismaClient } from './generated/prisma/index.js'
