import { ApiErrorException } from '@api/errors'
import { createRestHandler, type RestDependencies, requireSession } from '@api/rest/context'
import { accountProfileSchema } from '@broke-oclock/contracts/account'

export const getProfile = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (_request, response, context) => {
    const session = requireSession(context)

    // Read from the database (not the session) so the role is always up to date.
    const user = await context.db.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    })

    // The account was deleted while the session still existed.
    if (!user) {
      throw new ApiErrorException('UNAUTHORIZED')
    }

    response.json(
      accountProfileSchema.parse({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
      }),
    )
  })
