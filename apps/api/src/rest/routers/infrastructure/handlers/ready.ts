import { readinessResponseSchema } from '@broke-oclock/contracts/api'
import { db } from '@broke-oclock/db'
import type { RequestHandler } from 'express'

export const getReady: RequestHandler = async (_request, response) => {
  try {
    await db.user.findFirst({ select: { id: true } })
    response.json(readinessResponseSchema.parse({ ready: true }))
  } catch {
    response.status(503).json(readinessResponseSchema.parse({ ready: false }))
  }
}
