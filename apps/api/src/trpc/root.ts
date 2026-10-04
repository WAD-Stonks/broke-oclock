import { createTRPCRouter } from '@api/trpc/init'
import { infrastructureRouter } from '@api/trpc/routers/infrastructure'
import { ingestionRouter } from '@api/trpc/routers/ingestion'
import { platformAdminRouter } from '@api/trpc/routers/platform-admin'

export const appRouter = createTRPCRouter({
  infrastructure: infrastructureRouter,
  ingestion: ingestionRouter,
  platformAdmin: platformAdminRouter,
})
export type AppRouter = typeof appRouter
