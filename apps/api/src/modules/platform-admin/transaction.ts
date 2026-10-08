import { DomainError } from '@api/modules/domain-error'
import type { db } from '@broke-oclock/db'

export type Database = typeof db
export type AccessTransaction = Parameters<Parameters<Database['$transaction']>[0]>[0]
export const conflict = () =>
  new DomainError('CONFLICT', 'Access state changed; refresh before trying again')

// Acquire before any authorization read. Mongo snapshot reads alone do not prevent
// write skew. All platform writers and future merchant mutations share this fence.
export const fencePlatformAccess = async (tx: AccessTransaction) => {
  await tx.platformAccessFence.upsert({
    where: { id: 'platform-access' },
    create: { id: 'platform-access', version: 1 },
    update: { version: { increment: 1 } },
  })
}
export const accessTransaction = async <T>(
  db: Database,
  work: (tx: AccessTransaction) => Promise<T>,
): Promise<T> => {
  try {
    return await db.$transaction(async (tx) => {
      await fencePlatformAccess(tx)
      return work(tx)
    })
  } catch (error) {
    if (
      typeof error === 'object' &&
      error &&
      'code' in error &&
      ['P2034', 'P2002', 'P2025'].includes(String(error.code))
    )
      throw conflict()
    throw error
  }
}
export const requireCurrentAdmin = async (tx: AccessTransaction, actorId: string) => {
  const actor = await tx.user.findUnique({
    where: { id: actorId },
    select: { id: true, role: true, name: true, updatedAt: true },
  })
  if (actor?.role !== 'ADMIN') throw new DomainError('FORBIDDEN')
  // Also fence the actual identity record against a concurrent out-of-band demotion.
  await tx.user.update({
    where: { id: actor.id },
    data: { updatedAt: new Date(Math.max(Date.now(), actor.updatedAt.getTime() + 1)) },
  })
  return actor
}
export const currentUser = async (tx: AccessTransaction, userId: string) => {
  const user = await tx.user.findUnique({ where: { id: userId } })
  if (!user) throw new DomainError('NOT_FOUND', 'Account not found')
  return user
}
export const checkVersion = (actual: number | null, expected: number) => {
  if ((actual ?? 0) !== expected) throw conflict()
}
