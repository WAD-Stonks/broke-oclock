# @broke-oclock/email

Server-only Resend transport and escaped verification/password-reset templates. Public entry: `@broke-oclock/email/server`; browser resolution is rejected.

`createEmailClient({ apiKey, from, fetch?, timeoutMs? })` returns a one-shot sender. Pass `RESEND_API_KEY` and `EMAIL_FROM` explicitly from the consuming server. Missing, blank, UNSET or UNCONFIGURED values prevent network access. The fixed provider endpoint is `https://api.resend.com/emails`; redirects are rejected. Requests support an idempotency key, bounded timeout, validated header/body fields and safe generic errors. No automatic retries: a timeout can mean the provider accepted a message even if the response was lost.

`createVerificationEmail` and `createPasswordResetEmail` return HTML and plain text with escaped content and validated HTTP(S) links. Generate tokens/URLs with the auth provider on the server; never accept arbitrary user-provided action links or treat these templates as an authentication implementation. Use HTTPS for production links.

The GitHub production environment and `.env.example` contain RESEND_API_KEY/EMAIL_FROM placeholders. No real mail has been sent, no verified sending domain is claimed, and Better Auth email hooks/endpoints are not activated. Adding credentials alone does not enable auth flows. Provider responses are mocked in tests; those tests prove request/validation behaviour, not live email delivery.

Run `bun run test:packages` or full `bun run check:all`. Internal imports use `@email/*`. [Resend API contract](https://resend.com/docs/api-reference/emails/send-email).
