# @broke-oclock/storage

Shared UploadThing infrastructure, parallel to `@broke-oclock/db`.

## Public entry points

- `@broke-oclock/storage/server`: `createPhotoUploadHandler(options, getUserId)`; server only, rejected by browser resolution.
- `@broke-oclock/storage/client`: `uploadPhoto(file, options)`; browser-safe typed SDK helper, same-origin `/api/uploadthing`.
- `@broke-oclock/storage/types`: type-only contracts. No runtime barrel/export.

The package owns the SDK dependency and upload policy. Neither app imports the other. The API owns environment loading, Better Auth, origin checks, request-scoped identity capture and HTTP mounting. Inject the already-verified user ID before the SDK handles an upload; never accept a client-controlled identity. There are no database or application imports in this package.

The existing endpoint, JSON response, file limits and environment names are unchanged. Integration tests stay in the API because they verify the full auth/HTTP/database boundary; the browser test exercises the package via the web re-export. Root `bun run check:all` includes this package's typecheck.

Like the DB package, this private workspace exports TypeScript source. Bun consumes it directly; the future Vercel build must bundle/include workspace source. See [setup and security boundaries](../../docs/photo-storage.md) before enabling real uploads. This is not the assessed deal submission/ownership implementation.
