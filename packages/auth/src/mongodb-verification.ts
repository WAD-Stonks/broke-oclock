import { createHash } from 'node:crypto'
import type { prismaAdapter } from '@better-auth/prisma-adapter'
import type { DBTransactionAdapter, Verification, Where } from 'better-auth'

const digest = (value: string) => createHash('sha256').update(value).digest('base64url')
const cleanupPrefix = 'revoke-unproven-account-access:'
const isLogical = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[A-Za-z0-9_-]{43}$/u.test(value) &&
  Buffer.from(value, 'base64url').toString('base64url') === value
const physicalID = (value: string) =>
  createHash('sha256')
    .update(`broke-oclock:verification-reservation:v1:${value}`)
    .digest('hex')
    .slice(0, 24)

/** Pinned native cleanup reservations only; ordinary database IDs are unchanged. */
export const mongodbVerification = (
  factory: ReturnType<typeof prismaAdapter>,
): ReturnType<typeof prismaAdapter> => {
  const decorated = new WeakSet<DBTransactionAdapter>()
  const decorate = <A extends DBTransactionAdapter>(instance: A): A => {
    if (decorated.has(instance)) return instance
    decorated.add(instance)
    // Decorate the SAME object: native Prisma schema registration is identity-keyed.
    const original = { ...instance }
    const translate = async <
      T extends {
        model: string
        where?: Where[]
        update?: Record<string, unknown>
        set?: Record<string, unknown>
        increment?: Record<string, number>
      },
    >(
      args: T,
    ): Promise<T> => {
      if (args.model !== 'verification') return args
      if (
        (args.update && 'id' in args.update) ||
        (args.set && 'id' in args.set) ||
        (args.increment && 'id' in args.increment)
      )
        throw new Error('Verification IDs are immutable')
      const logical = args.where?.some(
        (p) =>
          p.field === 'id' &&
          (isLogical(p.value) || (Array.isArray(p.value) && p.value.some(isLogical))),
      )
      if (!logical) return args
      if (
        args.where?.some(
          (p) => (p.connector ?? 'AND') !== 'AND' || (p.field === 'id' && Array.isArray(p.value)),
        )
      )
        throw new Error('Unsupported logical reservation predicate')
      const where: Where[] = []
      for (const p of args.where ?? []) {
        if (p.field !== 'id' || !isLogical(p.value)) {
          where.push(p)
          continue
        }
        if ((p.operator ?? 'eq') !== 'eq' || p.mode === 'insensitive')
          throw new Error('Unsupported logical reservation predicate')
        const id = physicalID(p.value)
        const row = await original.findOne<Verification>({
          model: 'verification',
          where: [{ field: 'id', value: id }],
        })
        // No forgeable sentinel: a missing/mismatched full digest explicitly fails closed.
        if (
          !row?.identifier.startsWith(cleanupPrefix) ||
          digest(`reserve:${row.identifier}`) !== p.value
        )
          throw new Error('Verification reservation identity mismatch')
        where.push(
          { ...p, value: id },
          { field: 'identifier', value: row.identifier, operator: 'eq', connector: 'AND' },
        )
      }
      return { ...args, where }
    }
    instance.create = async (args) => {
      const data: Record<string, unknown> = args.data
      if (args.model === 'verification' && args.forceAllowId && isLogical(data.id)) {
        if (
          typeof data.identifier !== 'string' ||
          !data.identifier.startsWith(cleanupPrefix) ||
          digest(`reserve:${data.identifier}`) !== data.id
        )
          throw new Error('Unsupported verification reservation')
        return original.create({ ...args, data: { ...args.data, id: physicalID(data.id) } })
      }
      return original.create(args)
    }
    instance.findOne = async <T>(args: Parameters<A['findOne']>[0]) =>
      original.findOne<T>(await translate(args))
    instance.findMany = async <T>(args: Parameters<A['findMany']>[0]) =>
      original.findMany<T>(await translate(args))
    instance.update = async <T>(args: Parameters<A['update']>[0]) =>
      original.update<T>(await translate(args))
    instance.updateMany = async (args) => original.updateMany(await translate(args))
    instance.delete = async (args) => original.delete(await translate(args))
    instance.deleteMany = async (args) => original.deleteMany(await translate(args))
    instance.consumeOne = async <T>(args: Parameters<A['consumeOne']>[0]) =>
      original.consumeOne<T>(await translate(args))
    instance.incrementOne = async <T>(args: Parameters<A['incrementOne']>[0]) =>
      original.incrementOne<T>(await translate(args))
    instance.count = async (args) => original.count(await translate(args))
    return instance
  }
  return (options) => {
    const instance = factory(options)
    const transaction = instance.transaction
    decorate(instance)
    instance.transaction = (callback) => transaction((tx) => callback(decorate(tx)))
    return instance
  }
}
