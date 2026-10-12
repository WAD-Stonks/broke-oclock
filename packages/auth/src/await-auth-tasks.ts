import type { BetterAuthPlugin } from 'better-auth'

/** All configured native tasks must finish; failures must reach native HTTP dispatch. */
export const awaitAuthTasks = () =>
  ({
    id: 'await-auth-tasks',
    init: (context) => {
      if (context.options.advanced?.backgroundTasks?.handler)
        throw new Error('await-auth-tasks requires no background handler')
      return {
        context: {
          runInBackgroundOrAwait: async (promise) => {
            await promise
          },
        },
      }
    },
  }) satisfies BetterAuthPlugin
