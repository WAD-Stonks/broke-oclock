import { createHash, randomUUID } from 'node:crypto'
import { DomainError } from '@api/modules/domain-error'
import { moneyDigestPostSchema, parseMoneyDigestPost } from '@api/modules/ingestion/parser'
import type { IngestionRuntime } from '@api/modules/ingestion/runtime'
import { MONEYDIGEST_SOURCE, sourceWhere } from '@api/modules/ingestion/source'
import type { db } from '@broke-oclock/db'
import { z } from 'zod'

type Database = typeof db
const LEASE_MS = 120_000
const COOLDOWN_MS = 30_000
const safeErrorCode = (error: unknown) => {
  if (error instanceof z.ZodError) return 'MALFORMED_POST'
  const code = typeof error === 'object' && error && 'code' in error ? error.code : null
  return typeof code === 'string' &&
    ['TIMEOUT', 'NETWORK_ERROR', 'HTTP_ERROR', 'MALFORMED_RESPONSE', 'CONFLICT'].includes(code)
    ? code
    : 'INGESTION_FAILED'
}
export const releaseLease = (db: Database, sourceId: string, token: string) =>
  db.importSource.updateMany({
    where: { id: sourceId, leaseToken: token },
    data: { leaseToken: null, leaseExpiresAt: null },
  })
export const acquireLease = async (db: Database, now: Date) => {
  const source = await db.importSource.upsert({
    where: sourceWhere,
    create: { ...MONEYDIGEST_SOURCE, enabled: false },
    update: {},
  })
  if (!source.enabled || source.url !== MONEYDIGEST_SOURCE.url)
    throw new DomainError('PRECONDITION_FAILED', 'Approved source is disabled')
  const token = randomUUID()
  const lease = await db.importSource.updateMany({
    where: {
      id: source.id,
      enabled: true,
      url: MONEYDIGEST_SOURCE.url,
      OR: [
        { leaseExpiresAt: null },
        { leaseExpiresAt: { isSet: false } },
        { leaseExpiresAt: { lte: now } },
      ],
    },
    data: { leaseToken: token, leaseExpiresAt: new Date(now.getTime() + LEASE_MS) },
  })
  if (lease.count !== 1) throw new DomainError('CONFLICT', 'Source is busy')
  try {
    const recent = await db.ingestionRun.findFirst({
      where: { sourceId: source.id },
      orderBy: { startedAt: 'desc' },
      select: { startedAt: true },
    })
    if (recent && now.getTime() - recent.startedAt.getTime() < COOLDOWN_MS)
      throw new DomainError('TOO_MANY_REQUESTS', 'Source request cooldown')
    const run = await db.ingestionRun.create({
      data: { source: { connect: { id: source.id } }, startedAt: now, status: 'RUNNING' },
    })
    return { sourceId: source.id, token, run }
  } catch (error) {
    await releaseLease(db, source.id, token)
    throw error
  }
}
type Lease = Awaited<ReturnType<typeof acquireLease>>
const processPost = async (
  db: Database,
  runtime: IngestionRuntime,
  lease: Lease,
  input: unknown,
) => {
  const parsed = parseMoneyDigestPost(input)
  const { post, draft } = parsed
  const snapshot = JSON.stringify(post)
  const contentHash = createHash('sha256').update(snapshot).digest('hex')
  return db.$transaction(async (tx) => {
    const fence = await tx.importSource.updateMany({
      where: { id: lease.sourceId, leaseToken: lease.token, leaseExpiresAt: { gt: runtime.now() } },
      data: { leaseToken: lease.token },
    })
    if (fence.count !== 1) throw new DomainError('CONFLICT', 'Source lease expired')
    const previous = await tx.importedPost.findUnique({
      where: { sourceId_externalId: { sourceId: lease.sourceId, externalId: String(post.id) } },
      include: { deals: { include: { deal: true } } },
    })
    if (previous?.processedContentHash === contentHash && previous.status !== 'FAILED')
      return 'unchanged'
    const pending = previous?.deals.filter((link) => link.deal.reviewStatus === 'PENDING') ?? []
    const protectedContent =
      previous?.deals.some((link) => link.deal.reviewStatus === 'APPROVED') ?? false
    const replacePending = Boolean(draft && pending.length && !protectedContent)
    const sourceChanged = Boolean(previous?.deals.length && !replacePending)
    const metadata = {
      url: post.link,
      title: draft?.title ?? null,
      rawContent: post.content.rendered,
      contentHash,
      status: sourceChanged ? ('NEEDS_REVIEW' as const) : parsed.status,
      processedContentHash: contentHash,
      processedAt: runtime.now(),
      fetchedAt: runtime.now(),
      errorCode: sourceChanged ? 'SOURCE_CHANGED' : null,
    }
    const imported = await tx.importedPost.upsert({
      where: { sourceId_externalId: { sourceId: lease.sourceId, externalId: String(post.id) } },
      create: {
        source: { connect: { id: lease.sourceId } },
        externalId: String(post.id),
        ...metadata,
      },
      update: metadata,
    })
    if (!draft || sourceChanged) return 'unchanged'
    const contentVersion = pending.length
      ? Math.max(...pending.map((link) => link.deal.contentVersion)) + 1
      : 1
    // DealSource is immutable. Refresh by replacing the pending revision, not rewriting its citation.
    for (const link of pending) {
      const changed = await tx.deal.updateMany({
        where: {
          id: link.dealId,
          reviewStatus: 'PENDING',
          contentVersion: link.deal.contentVersion,
        },
        data: {
          reviewStatus: 'REJECTED',
          contentVersion: { increment: 1 },
          reviewNote: 'Superseded by source revision',
          reviewedVersion: null,
          reviewedById: null,
          reviewedAt: null,
          publishedAt: null,
        },
      })
      if (changed.count !== 1) throw new DomainError('CONFLICT', 'Draft changed')
    }
    await tx.deal.create({
      data: {
        ...draft,
        origin: 'IMPORTED',
        reviewStatus: 'PENDING',
        contentVersion,
        sources: {
          create: {
            importedPost: { connect: { id: imported.id } },
            sourceContentHash: contentHash,
            sourceContentSnapshot: snapshot,
            sourceUrl: post.link,
          },
        },
      },
    })
    return replacePending ? 'updated' : 'created'
  })
}
const recordPostFailure = async (
  db: Database,
  runtime: IngestionRuntime,
  lease: Lease,
  input: unknown,
  errorCode: string,
) => {
  const identity = moneyDigestPostSchema.pick({ id: true, link: true }).safeParse(input)
  if (!identity.success) return
  await db.$transaction(async (tx) => {
    const fence = await tx.importSource.updateMany({
      where: { id: lease.sourceId, leaseToken: lease.token, leaseExpiresAt: { gt: runtime.now() } },
      data: { leaseToken: lease.token },
    })
    if (fence.count !== 1) return
    const { id, link } = identity.data
    await tx.importedPost.upsert({
      where: { sourceId_externalId: { sourceId: lease.sourceId, externalId: String(id) } },
      create: {
        source: { connect: { id: lease.sourceId } },
        externalId: String(id),
        url: link,
        rawContent: '',
        contentHash: createHash('sha256').update(`failed:${id}`).digest('hex'),
        status: 'FAILED',
        errorCode,
        fetchedAt: runtime.now(),
      },
      update: {
        status: 'FAILED',
        errorCode,
        processedContentHash: null,
        processedAt: null,
        fetchedAt: runtime.now(),
      },
    })
  })
}
export const runIngestion = async (db: Database, runtime: IngestionRuntime) => {
  if (!runtime.enabled || !runtime.reuseApproved)
    throw new DomainError('PRECONDITION_FAILED', 'Ingestion and source reuse approval are required')
  const lease = await acquireLease(db, runtime.now())
  let fetchedCount = 0
  let createdCount = 0
  let updatedCount = 0
  let failedCount = 0
  let errorCode: string | null = null
  let providerFailed = false
  try {
    // Re-fence immediately at the external-request boundary. Persist its actual
    // start so a later process applies cooldown even if this process crashes.
    const requestedAt = runtime.now()
    await db.$transaction(async (tx) => {
      const fence = await tx.importSource.updateMany({
        where: {
          id: lease.sourceId,
          enabled: true,
          url: MONEYDIGEST_SOURCE.url,
          leaseToken: lease.token,
          leaseExpiresAt: { gt: requestedAt },
        },
        data: { leaseToken: lease.token },
      })
      if (fence.count !== 1) throw new DomainError('CONFLICT', 'Source lease expired')
      await tx.ingestionRun.update({
        where: { id: lease.run.id },
        data: { startedAt: requestedAt },
      })
    })
    const posts = await runtime.listPosts({ page: 1, perPage: 20 })
    if (!Array.isArray(posts) || posts.length > 20) throw new Error('INVALID_PAGE')
    fetchedCount = posts.length
    for (const input of posts) {
      try {
        const outcome = await processPost(db, runtime, lease, input)
        if (outcome === 'created') createdCount++
        if (outcome === 'updated') updatedCount++
      } catch (error) {
        failedCount++
        errorCode = safeErrorCode(error)
        await recordPostFailure(db, runtime, lease, input, errorCode)
      }
    }
  } catch (error) {
    providerFailed = true
    errorCode = safeErrorCode(error)
  } finally {
    await releaseLease(db, lease.sourceId, lease.token)
  }
  const status =
    providerFailed || (fetchedCount > 0 && failedCount === fetchedCount)
      ? ('FAILED' as const)
      : failedCount
        ? ('PARTIAL' as const)
        : ('SUCCEEDED' as const)
  await db.ingestionRun.update({
    where: { id: lease.run.id },
    data: {
      status,
      fetchedCount,
      createdCount,
      updatedCount,
      failedCount,
      errorCode,
      finishedAt: runtime.now(),
    },
  })
  return { runId: lease.run.id, status, fetchedCount, createdCount, updatedCount, failedCount }
}
