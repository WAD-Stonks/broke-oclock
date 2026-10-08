import { z } from 'zod'

export const boundedQueryInteger = (
  minimum: number,
  maximum: number,
  fallback: number,
  stringPattern: RegExp = /^(0|[1-9][0-9]*)$/,
) =>
  z
    .union([
      z.number().int().min(minimum).max(maximum),
      z.string().regex(stringPattern).transform(Number),
    ])
    .default(fallback)
    .pipe(z.number().int().min(minimum).max(maximum))
