import { PrismaClient } from '@db/generated/prisma/index'

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

export type { Account, Session, User, Verification } from '@db/generated/prisma/index'
export { PrismaClient } from '@db/generated/prisma/index'
