import { DomainError } from '@api/modules/domain-error'
import { MONEYDIGEST_SOURCE } from '@api/modules/ingestion/source'
import type { AccessTransaction } from '@api/modules/platform-admin/transaction'

type DraftSource = {
  sourceContentHash: string
  importedPost: Awaited<ReturnType<AccessTransaction['importedPost']['findUniqueOrThrow']>>
}

// Fence current processing evidence without changing pinned citation bytes.
// Rejection intentionally need not satisfy approval/association readiness.
export const fenceDraftEvidence = async (
  tx: AccessTransaction,
  sources: DraftSource[],
  now: Date,
  requireActive = false,
) => {
  if (requireActive && !sources.length) throw new DomainError('PRECONDITION_FAILED')
  const sourceIds = new Set<string>()
  for (const source of sources) {
    const evidence = source.importedPost
    if (requireActive) {
      if (
        source.sourceContentHash !== evidence.contentHash ||
        evidence.errorCode ||
        evidence.status !== 'NEEDS_REVIEW'
      )
        throw new DomainError('PRECONDITION_FAILED', 'Source evidence needs clarification')
      if (!sourceIds.has(evidence.sourceId)) {
        const publisher = await tx.importSource.findUnique({ where: { id: evidence.sourceId } })
        if (
          !publisher?.enabled ||
          publisher.provider !== MONEYDIGEST_SOURCE.provider ||
          publisher.externalId !== MONEYDIGEST_SOURCE.externalId ||
          publisher.url !== MONEYDIGEST_SOURCE.url
        )
          throw new DomainError('PRECONDITION_FAILED', 'Active supported source required')
        const changed = await tx.importSource.updateMany({
          where: {
            id: publisher.id,
            enabled: true,
            provider: publisher.provider,
            externalId: publisher.externalId,
            url: publisher.url,
            updatedAt: publisher.updatedAt,
          },
          data: { updatedAt: new Date(Math.max(now.getTime(), publisher.updatedAt.getTime() + 1)) },
        })
        if (changed.count !== 1) throw new DomainError('CONFLICT', 'Source evidence changed')
        sourceIds.add(evidence.sourceId)
      }
    }
    const fenced = await tx.importedPost.updateMany({
      where: {
        id: evidence.id,
        contentHash: evidence.contentHash,
        status: evidence.status,
        updatedAt: evidence.updatedAt,
        ...(evidence.errorCode === null
          ? { OR: [{ errorCode: null }, { errorCode: { isSet: false } }] }
          : { errorCode: evidence.errorCode }),
      },
      data: { updatedAt: new Date(Math.max(now.getTime(), evidence.updatedAt.getTime() + 1)) },
    })
    if (fenced.count !== 1) throw new DomainError('CONFLICT', 'Source evidence changed')
  }
}
