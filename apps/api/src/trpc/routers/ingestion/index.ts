import { createTRPCRouter } from '@api/trpc/init'
import { accountsProcedure } from '@api/trpc/routers/ingestion/procedures/accounts'
import { dashboardProcedure } from '@api/trpc/routers/ingestion/procedures/dashboard'
import { queueProcedure } from '@api/trpc/routers/ingestion/procedures/queue'
import { reviewProcedure } from '@api/trpc/routers/ingestion/procedures/review'
import { runProcedure } from '@api/trpc/routers/ingestion/procedures/run'
import { runsProcedure } from '@api/trpc/routers/ingestion/procedures/runs'
import { searchLocationsProcedure } from '@api/trpc/routers/ingestion/procedures/search-locations'
export const ingestionRouter = createTRPCRouter({
  dashboard: dashboardProcedure,
  run: runProcedure,
  queue: queueProcedure,
  review: reviewProcedure,
  runs: runsProcedure,
  accounts: accountsProcedure,
  searchLocations: searchLocationsProcedure,
})
