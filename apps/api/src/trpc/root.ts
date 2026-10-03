import { createTRPCRouter } from '@api/trpc/init'
import { infrastructureRouter } from '@api/trpc/routers/infrastructure'
import { ingestionRouter } from '@api/trpc/routers/ingestion'

export const appRouter = createTRPCRouter({
  infrastructure: infrastructureRouter,
  ingestion: ingestionRouter,
})
export type AppRouter = typeof appRouter
