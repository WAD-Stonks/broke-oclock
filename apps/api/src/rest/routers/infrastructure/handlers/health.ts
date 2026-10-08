import { healthResponseSchema } from '@broke-oclock/contracts/api'
import type { RequestHandler } from 'express'

export const getHealth: RequestHandler = (_request, response) => {
  response.json(healthResponseSchema.parse({ ok: true }))
}
