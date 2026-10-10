# community

Ownership: community interactions around deals, including discussion, votes, reports, or moderation surfaces as defined by the team plan.

`VoteControls.vue` takes `dealId` and `userId` (null when logged out), shows qualifying evidence and community status, and emits `loaded` and `updated` summaries. It can hide duplicate deal details with `showDealDetails=false`. `OutletEvidence.vue` accepts a summary and emits an updated summary. `CommentSection.vue` owns the flat discussion list/form, and `ReportForm.vue` submits a deal or comment content report. `ModerationQueue.vue` is mounted at `/admin/community` and uses staff-only API routes. Development-only `/community-demo` supplies sign-in and a synthetic local fixture. See root `docs/community.md`.
