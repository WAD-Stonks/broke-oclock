import { platformAdminProcedure } from '@api/modules/platform-admin/authorization'
import { reviewRequest } from '@api/modules/platform-admin/requests'
import { mutationResult, note, objectId, version } from '@api/modules/platform-admin/schemas'
import { z } from 'zod'

export const reviewRequestProcedure = platformAdminProcedure
  .input(
    z.strictObject({
      requestId: objectId,
      expectedVersion: version,
      decision: z.enum(['APPROVE', 'REJECT']),
      note,
    }),
  )
  .output(mutationResult)
  .mutation(({ ctx, input }) => reviewRequest(ctx.db, ctx.session.user.id, input))
