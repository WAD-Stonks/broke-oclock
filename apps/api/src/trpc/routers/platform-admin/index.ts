import { createTRPCRouter } from '@api/trpc/init'
import { accountProcedure } from '@api/trpc/routers/platform-admin/procedures/account'
import { accountsProcedure } from '@api/trpc/routers/platform-admin/procedures/accounts'
import { auditProcedure } from '@api/trpc/routers/platform-admin/procedures/audit'
import { changeRoleProcedure } from '@api/trpc/routers/platform-admin/procedures/change-role'
import { grantStallProcedure } from '@api/trpc/routers/platform-admin/procedures/grant-stall'
import { requestsProcedure } from '@api/trpc/routers/platform-admin/procedures/requests'
import { reviewRequestProcedure } from '@api/trpc/routers/platform-admin/procedures/review-request'
import { revokeStallProcedure } from '@api/trpc/routers/platform-admin/procedures/revoke-stall'
import { venuesProcedure } from '@api/trpc/routers/platform-admin/procedures/venues'

export const platformAdminRouter = createTRPCRouter({
  requests: requestsProcedure,
  reviewRequest: reviewRequestProcedure,
  revokeStall: revokeStallProcedure,
  account: accountProcedure,
  venues: venuesProcedure,
  grantStall: grantStallProcedure,
  accounts: accountsProcedure,
  audit: auditProcedure,
  changeRole: changeRoleProcedure,
})
