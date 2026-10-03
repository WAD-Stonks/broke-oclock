import { adminProcedure } from '@api/modules/ingestion/policy'
import { z } from 'zod'

const id = z.string().regex(/^[a-f0-9]{24}$/)
export const accountsProcedure = adminProcedure
  .input(
    z
      .object({ limit: z.number().int().min(1).max(50).default(20), cursor: id.optional() })
      .strict()
      .default({ limit: 20 }),
  )
  .output(
    z.object({
      items: z.array(
        z.object({
          id,
          name: z.string(),
          email: z.string(),
          role: z.enum(['USER', 'MODERATOR', 'ADMIN']),
          createdAt: z.string(),
        }),
      ),
      nextCursor: id.nullable(),
    }),
  )
  .query(async ({ ctx, input }) => {
    const rows = await ctx.db.user.findMany({
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
    return { items, nextCursor: rows.length > input.limit ? (items.at(-1)?.id ?? null) : null }
  })
