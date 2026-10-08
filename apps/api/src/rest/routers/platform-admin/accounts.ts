import type { RestDependencies } from '@api/rest/context'
import { createRestHandler, requireAdmin } from '@api/rest/context'
import { page, parseRestValue } from '@api/rest/routers/platform-admin/validation'
import {
  platformAccountSummarySchema,
  platformAccountsQuerySchema,
  platformPageSchema,
} from '@broke-oclock/contracts/platform-admin'

export const listAdminAccounts = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    await requireAdmin(context, 'FORBIDDEN')
    const input = parseRestValue(platformAccountsQuerySchema, request.query)
    const rows = await context.db.user.findMany({
      where: {
        role: input.role,
        ...(input.cursor ? { id: { gt: input.cursor } } : {}),
        ...(input.search
          ? {
              OR: [
                { name: { contains: input.search, mode: 'insensitive' } },
                { email: { contains: input.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { id: 'asc' },
      take: input.limit + 1,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        platformVersion: true,
        createdAt: true,
      },
    })
    const result = page(
      rows.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        version: user.platformVersion ?? 0,
        createdAt: user.createdAt.toISOString(),
      })),
      input.limit,
    )
    response.json(platformPageSchema(platformAccountSummarySchema).parse(result))
  })
