import { db } from '@db/client'
import { assertLocalDatabaseUrl } from '@db/seed/guard'
import { seedDevelopmentData } from '@db/seed/index'

// Local development only: `pnpm run db:seed` with `pnpm run db:local` running in another terminal.
try {
  assertLocalDatabaseUrl(process.env.DATABASE_URL)
  const summary = await seedDevelopmentData(db)
  console.info(
    `Seeded ${summary.deals} synthetic deals across ${summary.venues} outlets of ${summary.merchants} merchants (${summary.dealVenues} outlet links, ${summary.users} seed users).`,
  )
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await db.$disconnect()
}
