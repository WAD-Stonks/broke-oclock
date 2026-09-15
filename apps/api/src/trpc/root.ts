import { createTRPCRouter } from '@api/trpc/init'
import { infrastructureProcedures } from '@api/trpc/routers/infrastructure'

// Keep the existing health/me paths; register future student-owned subrouters here.
export const appRouter = createTRPCRouter({ ...infrastructureProcedures })
export type AppRouter = typeof appRouter
