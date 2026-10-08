import type { ApiErrorCode } from '@broke-oclock/contracts/api'

export type DomainErrorCode = Exclude<
  ApiErrorCode,
  'INTERNAL_SERVER_ERROR' | 'METHOD_NOT_ALLOWED' | 'PAYLOAD_TOO_LARGE' | 'UNSUPPORTED_MEDIA_TYPE'
>

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string = code,
  ) {
    super(message)
    this.name = 'DomainError'
  }
}
