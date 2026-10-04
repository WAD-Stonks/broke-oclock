import { platformAdminProcedure } from '@api/modules/platform-admin/authorization'
import { revokeStall } from '@api/modules/platform-admin/grants'
import { mutationResult, note, objectId, version } from '@api/modules/platform-admin/schemas'
import { z } from 'zod'

export const revokeStallProcedure = platformAdminProcedure
  .input(z.strictObject({ grantId: objectId, expectedVersion: version, note }))
  .output(mutationResult)
  .mutation(({ ctx, input }) => revokeStall(ctx.db, ctx.session.user.id, input))
