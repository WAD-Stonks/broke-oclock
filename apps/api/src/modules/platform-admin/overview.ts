import type { AppConfig } from '@api/config'
import { importedDealScope } from '@api/modules/ingestion/review-policy'
import { MONEYDIGEST_SOURCE, sourceWhere } from '@api/modules/ingestion/source'
import type { RestContext } from '@api/rest/context'
import { adminOverviewResponseSchema } from '@broke-oclock/contracts/platform-admin'

export const readAdminOverview = async (context: RestContext, config: AppConfig) => {
  const generatedAt = (context.ingestion?.now() ?? new Date()).toISOString()
  const source = await context.db.importSource.findUnique({
    where: sourceWhere,
    select: { provider: true, externalId: true, url: true, enabled: true },
  })
  const fixedSource = {
    provider: MONEYDIGEST_SOURCE.provider,
    externalId: MONEYDIGEST_SOURCE.externalId,
  }
  const [pendingMerchantRequests, pendingImportedDrafts, failedImportedPosts, runs] =
    await Promise.all([
      context.db.merchantAccessRequest.count({ where: { status: 'PENDING' } }),
      context.db.deal.count({ where: { ...importedDealScope, reviewStatus: 'PENDING' } }),
      context.db.importedPost.count({ where: { source: fixedSource, status: 'FAILED' } }),
      context.db.ingestionRun.findMany({
        where: { source: fixedSource },
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        take: 10,
        select: {
          id: true,
          status: true,
          startedAt: true,
          finishedAt: true,
          fetchedCount: true,
          createdCount: true,
          updatedCount: true,
          failedCount: true,
          errorCode: true,
          source: { select: { name: true } },
        },
      }),
    ])
  const sourceIdentityValid = Boolean(
    source &&
      source.provider === MONEYDIGEST_SOURCE.provider &&
      source.externalId === MONEYDIGEST_SOURCE.externalId &&
      source.url === MONEYDIGEST_SOURCE.url,
  )
  const sourceRecordEnabled = source?.enabled ?? false
  const ingestionOptIn = context.ingestion?.enabled ?? false
  const reuseAttested = context.ingestion?.reuseApproved ?? false
  return adminOverviewResponseSchema.parse({
    generatedAt,
    counts: { pendingMerchantRequests, pendingImportedDrafts, failedImportedPosts },
    recentRuns: runs.map((row) => ({
      id: row.id,
      sourceName: row.source.name,
      status: row.status,
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
      fetchedCount: row.fetchedCount,
      createdCount: row.createdCount,
      updatedCount: row.updatedCount,
      failedCount: row.failedCount,
      errorCode: row.errorCode,
    })),
    readiness: {
      googleConfigured: Boolean(config.authProviders?.google),
      emailConfigured: Boolean(config.authProviders?.email),
      oneMapConfigured: Boolean(context.ingestion?.searchLocations),
      ingestionOptIn,
      reuseAttested,
      sourceRecordEnabled,
      sourceIdentityValid,
      importAllowed: ingestionOptIn && reuseAttested && sourceRecordEnabled && sourceIdentityValid,
      liveProviderAcceptance: 'NOT_ESTABLISHED',
    },
  })
}
