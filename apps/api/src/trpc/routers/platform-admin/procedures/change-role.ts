import { platformAdminProcedure } from '@api/modules/platform-admin/authorization'
import { changeRole } from '@api/modules/platform-admin/roles'
import {
  mutationResult,
  note,
  objectId,
  roleSchema,
  version,
} from '@api/modules/platform-admin/schemas'
import { z } from 'zod'

export const changeRoleProcedure = platformAdminProcedure
  .input(z.strictObject({ userId: objectId, expectedVersion: version, role: roleSchema, note }))
  .output(mutationResult)
  .mutation(({ ctx, input }) => changeRole(ctx.db, ctx.session.user.id, input))
