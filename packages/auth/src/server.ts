import { createHash } from 'node:crypto'
import { awaitAuthTasks } from '@auth/await-auth-tasks'
import { createGoogleAccountFence } from '@auth/google-account-fence'
import { mongodbVerification } from '@auth/mongodb-verification'
import { prismaAdapter } from '@better-auth/prisma-adapter'
import { db } from '@broke-oclock/db'
import { betterAuth, getCurrentAdapter, type User, type Verification } from 'better-auth'
import {
  APIError,
  createAuthMiddleware,
  getAuthoritativeSessionFromCtx,
  getOAuthState,
} from 'better-auth/api'
import { verifyProviderIdToken } from 'better-auth/oauth2'
import { type EmailOTPOptions, emailOTP } from 'better-auth/plugins/email-otp'

export type EmailOTPData = Parameters<EmailOTPOptions['sendVerificationOTP']>[0]
export type AuthConfig = {
  baseURL: string
  secret: string
  trustedOrigin: string
  google?: { clientId: string; clientSecret: string }
  sendEmailOTP?: (data: EmailOTPData) => Promise<void>
}
const deliveryFailure = () =>
  APIError.fromStatus('INTERNAL_SERVER_ERROR', { message: 'Email authentication delivery failed' })
const linkFailure = () =>
  APIError.fromStatus('FORBIDDEN', {
    code: 'LOCAL_EMAIL_NOT_VERIFIED',
    message: 'Verify your local email before linking.',
  })

// The consuming API validates environment values before calling this factory.
export const createAuth = (config: AuthConfig) => {
  const googleFence = createGoogleAccountFence()
  // Public native Request identity survives endpoint/hook contexts; shared AuthContext does not own proof.
  const googleEmails = new WeakMap<
    Request,
    Readonly<{
      email: string
      userId: string | null
      link: { userId: string; email: string } | null
    }>
  >()
  return betterAuth({
    baseURL: config.baseURL,
    basePath: '/api/auth',
    rateLimit: { enabled: true, window: 60, max: 100 },
    secret: config.secret,
    trustedOrigins: [config.trustedOrigin],
    // Native diagnostics can include OAuth state and provider errors. Keep level/event only.
    logger: {
      level: 'warn',
      log: (level) => {
        console.warn(JSON.stringify({ event: 'native-auth-diagnostic', level }))
      },
    },
    database: googleFence.adapter(
      mongodbVerification(prismaAdapter(db, { provider: 'mongodb', transaction: true })),
    ),
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 300,
        allowedAttempts: 3,
        storeOTP: 'hashed',
        resendStrategy: 'rotate',
        disableSignUp: false,
        sendVerificationOnSignUp: false,
        overrideDefaultEmailVerification: false,
        changeEmail: { enabled: false },
        rateLimit: { window: 60, max: 3 },
        sendVerificationOTP: async ({ email, otp, type }, ctx) => {
          if (!config.sendEmailOTP)
            throw APIError.fromStatus('SERVICE_UNAVAILABLE', {
              message: 'Email authentication is unavailable',
            })
          if (!ctx) throw deliveryFailure()
          const adapter = await getCurrentAdapter(ctx.context.adapter)
          const identifier = `${type}-otp-${email}`
          const value = `${createHash('sha256').update(otp).digest('base64url')}:0`
          const rows = await adapter.findMany<Verification>({
            model: 'verification',
            limit: 2,
            where: [
              { field: 'identifier', value: identifier },
              { field: 'value', value },
            ],
          })
          const row = rows[0]
          if (rows.length !== 1 || !row) throw deliveryFailure()
          try {
            await config.sendEmailOTP({ email, otp, type })
          } catch {
            try {
              await adapter.deleteMany({
                model: 'verification',
                where: [
                  { field: 'id', value: row.id },
                  { field: 'identifier', value: row.identifier },
                  { field: 'value', value: row.value },
                  { field: 'expiresAt', value: row.expiresAt },
                ],
              })
            } catch {
              /* Failure must still reach native dispatch even if cleanup fails. */
            }
            throw deliveryFailure()
          }
        },
      }),
      awaitAuthTasks(),
    ],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === '/link-social' && ctx.body?.provider === 'google') {
          const session = await getAuthoritativeSessionFromCtx(ctx)
          if (!session?.user.emailVerified) throw linkFailure()
          // Pinned 1.7.5 direct ID-token linking skips validateUserInfo. Use its public native verifier.
          if (ctx.body.idToken) {
            const provider = ctx.context.socialProviders.find(
              (candidate) => candidate.id === 'google',
            )
            const { token, nonce, accessToken, refreshToken } = ctx.body.idToken
            if (
              !provider ||
              typeof token !== 'string' ||
              (nonce !== undefined && typeof nonce !== 'string') ||
              !(await verifyProviderIdToken(provider, token, nonce, ctx))
            )
              throw APIError.fromStatus('UNAUTHORIZED', {
                code: 'INVALID_TOKEN',
                message: 'Invalid token',
              })
            const info = await provider.getUserInfo({ idToken: token, accessToken, refreshToken })
            const validate = ctx.context.options.user?.validateUserInfo
            if (!info?.user || typeof info.user.email !== 'string' || !validate) throw linkFailure()
            const result = await validate(
              {
                user: { ...info.user, id: session.user.id, email: info.user.email },
                source: {
                  action: 'link-account',
                  method: 'oauth',
                  oauth: { providerId: 'google' },
                },
              },
              ctx,
            )
            if (result?.error)
              throw APIError.fromStatus('FORBIDDEN', {
                code: result.error,
                message: result.errorDescription ?? 'Google linking refused',
              })
          }
        }
        if (
          !config.sendEmailOTP &&
          (ctx.path === '/sign-in/email-otp' ||
            ctx.path.startsWith('/email-otp/') ||
            ctx.path === '/forget-password/email-otp')
        )
          throw APIError.fromStatus('SERVICE_UNAVAILABLE', {
            message: 'Email authentication is unavailable',
          })
      }),
    },
    socialProviders: config.google ? { google: config.google } : {},
    account: {
      accountLinking: {
        enabled: true,
        disableImplicitLinking: false,
        requireLocalEmailVerified: true,
        trustedProviders: [],
        allowDifferentEmails: false,
        allowUnlinkingAll: false,
        updateUserInfoOnLink: false,
      },
    },
    user: {
      validateUserInfo: async ({ user, source }, ctx?) => {
        if (source.method !== 'oauth' || source.oauth?.providerId !== 'google') return
        if (ctx?.request) googleEmails.delete(ctx.request)
        if (user.emailVerified !== true)
          return {
            error: 'EMAIL_NOT_VERIFIED',
            errorDescription: 'Verify your email before signing in.',
          }
        // Returning sign-in creates no account. A standalone provisioning policy probe mints no proof.
        if (source.action === 'sign-in' || (source.action === 'create-user' && !ctx)) return
        if (!ctx?.request || typeof user.email !== 'string' || !user.email)
          return {
            error: 'LOCAL_EMAIL_NOT_VERIFIED',
            errorDescription: 'Verify your local email before linking.',
          }
        const state = await getOAuthState()
        if (source.action === 'link-account') {
          const adapter = await getCurrentAdapter(ctx.context.adapter)
          const local =
            typeof user.id === 'string'
              ? await adapter.findOne<User>({
                  model: 'user',
                  where: [{ field: 'id', value: user.id }],
                })
              : null
          const explicit = Boolean(state?.link) || ctx.path === '/link-social'
          const session = explicit ? await getAuthoritativeSessionFromCtx(ctx) : null
          if (
            !local?.emailVerified ||
            typeof user.email !== 'string' ||
            local.email.toLowerCase() !== user.email.toLowerCase() ||
            (state?.link && state.link.email.toLowerCase() !== user.email.toLowerCase()) ||
            (explicit &&
              (!session ||
                session.user.id !== local.id ||
                (state?.link && state.link.userId !== session.user.id)))
          )
            return {
              error: 'LOCAL_EMAIL_NOT_VERIFIED',
              errorDescription: 'Verify your local email before linking.',
            }
        }
        if (source.action !== 'link-account' && source.action !== 'create-user') return
        googleEmails.set(
          ctx.request,
          Object.freeze({
            email: user.email.toLowerCase(),
            userId:
              source.action === 'link-account' && typeof user.id === 'string' ? user.id : null,
            link: state?.link
              ? { userId: state.link.userId, email: state.link.email.toLowerCase() }
              : null,
          }),
        )
      },
      additionalFields: {
        role: {
          type: ['USER', 'MERCHANT', 'MODERATOR', 'ADMIN'],
          required: false,
          defaultValue: 'USER',
          input: false,
          returned: true,
        },
      },
    },
    // Staff authorization must use fresh DB sessions. GET preserves DB; native POST renews.
    session: { cookieCache: { enabled: false }, deferSessionRefresh: true },
    databaseHooks: {
      account: {
        create: {
          before: async (account, ctx) => {
            if (account.providerId !== 'google') return
            if (!ctx) return false
            if (!ctx.request) throw linkFailure()
            const proof = googleEmails.get(ctx.request)
            googleEmails.delete(ctx.request)
            if (!proof || (proof.userId !== null && proof.userId !== account.userId))
              throw linkFailure()
            // Includes native transaction-local newly created OAuth users, never global/cached identity.
            const adapter = await getCurrentAdapter(ctx.context.adapter)
            const local = await adapter.findOne<User>({
              model: 'user',
              where: [{ field: 'id', value: account.userId }],
            })
            const state = await getOAuthState()
            const explicit = Boolean(state?.link) || ctx.path === '/link-social'
            const session = explicit ? await getAuthoritativeSessionFromCtx(ctx) : null
            if (
              !local?.emailVerified ||
              local.email.toLowerCase() !== proof.email ||
              (proof.link &&
                (proof.link.userId !== account.userId || proof.link.email !== proof.email)) ||
              (explicit &&
                (!session ||
                  session.user.id !== account.userId ||
                  (state?.link && state.link.userId !== session.user.id)))
            )
              throw linkFailure()
            return {
              data: googleFence.stamp(account, {
                userId: local.id,
                email: local.email,
                provenEmail: proof.email,
                accountId: account.accountId,
                sessionId: explicit && session ? session.session.id : null,
              }),
            }
          },
        },
      },
    },
    emailAndPassword: { enabled: true, revokeSessionsOnPasswordReset: true },
    advanced: {
      // Keep security checks identical under NODE_ENV=test and production.
      disableOriginCheck: false,
      disableCSRFCheck: false,
      database: { generateId: false },
    },
  })
}
