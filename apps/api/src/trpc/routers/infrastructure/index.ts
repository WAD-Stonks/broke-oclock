import { createTRPCRouter } from '@api/trpc/init'
import { healthProcedure } from '@api/trpc/routers/infrastructure/procedures/health'
import { meProcedure } from '@api/trpc/routers/infrastructure/procedures/me'

export const infrastructureRouter = createTRPCRouter({
  health: healthProcedure,
  me: meProcedure,
})
