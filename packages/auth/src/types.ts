import type { createAuth } from '@auth/server'

export type { AuthConfig, EmailOTPData } from '@auth/server'
export type Auth = ReturnType<typeof createAuth>
export type Session = Auth['$Infer']['Session']
export type User = Session['user']
