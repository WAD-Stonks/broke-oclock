import type { RouterOutputs } from '@web/lib/api-client'

type Draft = RouterOutputs['ingestion']['queue']['items'][number]

export const approvalBlockReason = (draft: Draft | undefined, now = Date.now()): string => {
  if (!draft?.validFrom || !draft.validUntil)
    return 'Approval requires known validity dates. Unknown validity is not valid now.'
  const start = Date.parse(draft.validFrom)
  const end = Date.parse(draft.validUntil)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end)
    return 'Validity dates are invalid. Approval is disabled.'
  if (end <= now) return 'This offer has expired. Approval is disabled.'
  // The server may expose an additional readiness veto; absence does not invent approval.
  if ('reviewReady' in draft && draft.reviewReady === false) {
    return 'The server requires source or offer clarification. Approval is disabled.'
  }
  return ''
}
