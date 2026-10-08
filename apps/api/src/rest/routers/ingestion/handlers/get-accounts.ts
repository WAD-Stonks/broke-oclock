import { createRestHandler, type RestDependencies, requireAdmin } from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import {
  ingestionAccountsQuerySchema,
  ingestionAccountsResponseSchema,
} from '@broke-oclock/contracts/ingestion'
import type { RequestHandler } from 'express'

export const getIngestionAccounts = (dependencies: RestDependencies): RequestHandler =>
  createRestHandler(dependencies, async (request, response, context) => {
    await requireAdmin(context)
    const input = parseRestInput(ingestionAccountsQuerySchema, request.query)
    const rows = await context.db.user.findMany({
      where: input.cursor ? { id: { gt: input.cursor } } : {},
      orderBy: { id: 'asc' },
      take: input.limit + 1,
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    })
    const items = rows.slice(0, input.limit).map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      createdAt: row.createdAt.toISOString(),
    }))
    response.json(
      ingestionAccountsResponseSchema.parse({
        items,
        nextCursor: rows.length > input.limit ? (items.at(-1)?.id ?? null) : null,
      }),
    )
  })
