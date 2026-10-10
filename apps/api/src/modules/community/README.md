# community

Damien owns community votes, reports and comments. `voting.ts` handles revision-aware whole-deal and outlet evidence, eligibility, freshness and status. `discussion.ts` handles comments, content reports and staff moderation. See root `docs/community.md` for API and concurrency details.

REST handlers live under `src/rest/routers/community`; contracts are exported from `@broke-oclock/contracts/community`. See root docs/architecture.md and docs/ai-use.md. Deal editors must increment `contentVersion`, invalidate approval, and write the deal row so evidence transactions conflict with concurrent edits.
