import { createTRPCRouter } from '@api/trpc/init'
import { infrastructureProcedures } from '@api/trpc/routers/infrastructure'
import { ingestionRouter } from '@api/trpc/routers/ingestion'

// Keep the existing health/me paths; register future student-owned subrouters here.
export const appRouter = createTRPCRouter({
  ...infrastructureProcedures,
  ingestion: ingestionRouter,
})
export type AppRouter = typeof appRouter
