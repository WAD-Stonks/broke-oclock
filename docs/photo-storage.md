# Photo storage — UploadThing

## Implemented infrastructure

- `apps/api/src/uploads.ts`: Express SDK adapter at `/api/uploadthing`; route slug `photoUploader`.
- `apps/api/src/config.ts`: consumes PHOTO_STORAGE_PROVIDER and server-only UPLOADTHING_TOKEN. Without a real configured value, uploads return 503; the rest of the starter still starts.
- `apps/web/src/lib/photo-upload.ts`: typed `uploadPhoto(file, options)` helper using the same-origin `/api/uploadthing` route. Supports AbortSignal and the SDK progress callback. No VITE_* secret or extra public API URL needed.
- `@broke-oclock/api/photo-router` exports **types only** for SDK inference. The browser must never runtime-import server code; the package export intentionally has no runtime target.
- UploadThing 7.7.4 is pinned in API and web. Root `effect: 3.21.0` override fixes GHSA-38f7-945m-qr2g; do not remove until the SDK ships a patched compatible dependency. The pre-existing Prisma CLI advisory exception is separate and unchanged.

## Configuration

1. Create an app on [UploadThing](https://uploadthing.com/dashboard), and copy its SDK token from API Keys.
2. Replace GitHub `production` secret UPLOADTHING_TOKEN with that token. PHOTO_STORAGE_PROVIDER is `uploadthing`.
3. For local development, set the same two keys in ignored root `.env`. Existing `.env` is deliberately not overwritten by setup. Never commit or paste the token into chat.
4. Restart the API after environment changes. GitHub production secrets are not automatically present locally or in Vercel: deployment mapping remains separate unfinished work.
5. In production, the configured BETTER_AUTH_URL origin plus `/api/uploadthing` is the callback URL. The future web rewrite must forward this path, its query string/body and UploadThing signature headers to Express. UploadThing must be able to reach the endpoint without a login wall or Vercel deployment protection challenge. Only the browser upload initiation needs a session; provider callbacks are authenticated by SDK signatures.

The free plan includes 2 GB shared across apps. It lists private files and region selection as paid features. Use this setup only for public deal photos, never confidential documents. Monitor usage and remove orphaned uploads before expanding beyond a demonstration.

## Client usage

```ts
import { uploadPhoto } from './lib/photo-upload'

// Call from the student-owned form after selecting/compressing an image.
const photo = await uploadPhoto(file, {
  signal: abortController.signal,
  onUploadProgress: ({ progress }) => updateProgress(progress),
})
// photo: { key, url, uploadedBy }
```

The example assumes a caller in `apps/web/src`; adjust the relative import for your component. `file`, `abortController` and `updateProgress` above are caller-owned values, not implemented application state. Supply an actual File and handle promise rejection. A browser login/session cookie is required. The helper is not yet attached to the assessed deal form.

## Security boundaries and remaining work

- Browser upload initiation requires the exact WEB_ORIGIN and Better Auth session. Identity is resolved before entering the Effect SDK and kept in a request-keyed WeakMap, not ambient AsyncLocalStorage. Client input cannot choose uploadedBy.
- Server route policy permits exactly one JPEG, PNG or WebP, nonempty and at most 4 MB. The control-plane JSON request is limited to 16 KB. Uploaded binary goes directly to UploadThing rather than through Vercel's function body.
- These checks validate declared metadata, not file magic bytes or content safety. Image decoding/re-encoding, moderation and EXIF privacy handling are not implemented; do not describe this as content scanning.
- The SDK authenticates provider callbacks. Do not add a browser-session requirement to callbacks or disable signature verification to make deployment work.
- Returning key/url/uploadedBy to the browser does **not** prove ownership in a later deal request: the browser can alter them. The team must persist verified completion metadata server-side, verify ownership before attaching/deleting, and implement idempotent callbacks/cleanup before shipping the deal-photo feature. No unauthenticated delete endpoint or arbitrary URL importer is included.
- No per-user persistent upload quota/rate limiter is implemented. Add one before broad public use; an authenticated account must not be allowed to consume the shared free quota without bounds.

## Verification scope

Unit tests cover configuration; real local HTTP tests use actual Better Auth/Prisma/MongoDB and the real SDK with explicitly synthetic UploadThing network responses. Chromium exercises the actual browser helper against a stubbed unavailable-storage response. These tests can validate wiring and security boundaries, but are **not proof of a successful hosted upload**. A live upload/readback/delete check still needs a real account token and reachable deployment.

## References

- [Express adapter and Vue example](https://docs.uploadthing.com/backend-adapters/express)
- [File routes and policies](https://docs.uploadthing.com/file-routes)
- [Client helper API](https://docs.uploadthing.com/api-reference/client)
- [Pricing](https://uploadthing.com/pricing)
- [Effect advisory](https://github.com/advisories/GHSA-38f7-945m-qr2g)
