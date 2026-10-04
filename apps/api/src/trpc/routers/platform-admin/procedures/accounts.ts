import { platformAdminProcedure } from '@api/modules/platform-admin/authorization'
import {
  accountSummary,
  page,
  pageOf,
  pagination,
  roleSchema,
  search,
} from '@api/modules/platform-admin/schemas'
import { z } from 'zod'

export const accountsProcedure = platformAdminProcedure
  .input(z.strictObject({ ...pagination, search, role: roleSchema.optional() }))
  .output(pageOf(accountSummary))
  .query(async ({ ctx, input }) => {
    const users = await ctx.db.user.findMany({
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
    return page(
      users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        version: u.platformVersion ?? 0,
        createdAt: u.createdAt.toISOString(),
      })),
      input.limit,
    )
  })
