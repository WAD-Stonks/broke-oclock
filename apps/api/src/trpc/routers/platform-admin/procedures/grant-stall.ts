import { platformAdminProcedure } from '@api/modules/platform-admin/authorization'
import { grantStall } from '@api/modules/platform-admin/grants'
import { mutationResult, note, objectId, version } from '@api/modules/platform-admin/schemas'
import { z } from 'zod'

export const grantStallProcedure = platformAdminProcedure
  .input(
    z.strictObject({ userId: objectId, venueId: objectId, expectedUserVersion: version, note }),
  )
  .output(mutationResult)
  .mutation(({ ctx, input }) => grantStall(ctx.db, ctx.session.user.id, input))
