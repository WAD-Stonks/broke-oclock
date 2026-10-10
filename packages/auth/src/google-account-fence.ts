import type { prismaAdapter } from '@better-auth/prisma-adapter'
import type { DBTransactionAdapter, Session, User, Where } from 'better-auth'
import { APIError } from 'better-auth/api'

type Proof = Readonly<{
  userId: string
  email: string
  provenEmail: string
  accountId: string
  sessionId: string | null
}>
const denied = () =>
  APIError.fromStatus('FORBIDDEN', {
    code: 'LOCAL_EMAIL_NOT_VERIFIED',
    message: 'Verify your local email before linking.',
  })
const advance = (previous: Date) => {
  const value = previous.getTime()
  if (!Number.isFinite(value)) throw denied()
  return new Date(Math.max(Date.now(), value + 1))
}

/** Request-owned native hook proof; no JSON field or global request context can supply it. */
export const createGoogleAccountFence = () => {
  const key = Symbol('native-google-admission')
  const trusted = new WeakSet<Proof>()
  const originals = new WeakMap<DBTransactionAdapter, DBTransactionAdapter['create']>()
  const stamp = <T extends { userId: string; accountId: string }>(data: T, proof: Proof): T => {
    const admission = Object.freeze({ ...proof })
    trusted.add(admission)
    return { ...data, [key]: admission }
  }
  const adapter = (factory: ReturnType<typeof prismaAdapter>): ReturnType<typeof prismaAdapter> => {
    const decorate = <A extends DBTransactionAdapter>(instance: A, inTransaction: boolean): A => {
      if (originals.has(instance)) return instance
      const create = instance.create
      originals.set(instance, create)
      instance.create = async <T extends Record<string, unknown>, R = T>(args: {
        model: string
        data: Omit<T, 'id'>
        select?: string[]
        forceAllowId?: boolean
      }): Promise<R> => {
        if (args.model !== 'account' || args.data.providerId !== 'google') return create<T, R>(args)
        const data = { ...args.data }
        const proof = (data as Record<symbol, Proof>)[key]
        delete (data as Record<symbol, Proof>)[key]
        if (
          !proof ||
          !trusted.delete(proof) ||
          proof.userId !== data.userId ||
          proof.accountId !== data.accountId
        )
          throw denied()
        const insert = async (tx: DBTransactionAdapter) => {
          const local = await tx.findOne<User>({
            model: 'user',
            where: [{ field: 'id', value: proof.userId }],
          })
          if (
            !local?.emailVerified ||
            local.email !== proof.email ||
            local.email.toLowerCase() !== proof.provenEmail
          )
            throw denied()
          // The exact raw email predicate below is bound to the normalized provider proof above.
          const userWhere: Where[] = [
            { field: 'id', value: proof.userId },
            { field: 'email', value: proof.email },
            { field: 'emailVerified', value: true },
            { field: 'updatedAt', value: local.updatedAt },
          ]
          // A meaningful conditional write, not a same-value no-op: Mongo conflicts fence proof loss.
          if (
            (await tx.updateMany({
              model: 'user',
              where: userWhere,
              update: { updatedAt: advance(local.updatedAt) },
            })) !== 1
          )
            throw denied()
          if (proof.sessionId !== null) {
            const session = await tx.findOne<Session>({
              model: 'session',
              where: [{ field: 'id', value: proof.sessionId }],
            })
            if (
              !session ||
              session.userId !== proof.userId ||
              session.expiresAt.getTime() <= Date.now()
            )
              throw denied()
            // updatedAt is not native renewal/freshness age; never alter expiry or createdAt.
            if (
              (await tx.updateMany({
                model: 'session',
                where: [
                  { field: 'id', value: proof.sessionId },
                  { field: 'userId', value: proof.userId },
                  { field: 'updatedAt', value: session.updatedAt },
                  { field: 'expiresAt', value: new Date(), operator: 'gt' },
                ],
                update: { updatedAt: advance(session.updatedAt) },
              })) !== 1
            )
              throw denied()
          }
          const original = originals.get(tx)
          if (!original) throw denied()
          return original<T, R>({ ...args, data })
        }
        if (inTransaction) return insert(instance)
        // Root and native first-OAuth creation share the same decorated transaction boundary.
        const root = instance as A & {
          transaction: ReturnType<ReturnType<typeof prismaAdapter>>['transaction']
        }
        return root.transaction(insert)
      }
      return instance
    }
    return (options) => {
      const instance = factory(options)
      if (typeof instance.options?.adapterConfig.transaction !== 'function')
        throw new Error('Google account admission requires a transactional adapter')
      const transaction = instance.transaction
      decorate(instance, false)
      instance.transaction = (callback) => transaction((tx) => callback(decorate(tx, true)))
      return instance
    }
  }
  return { adapter, stamp }
}
