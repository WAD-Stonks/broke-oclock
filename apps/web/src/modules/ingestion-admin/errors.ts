export const errorCode = (error: unknown): string | undefined => {
  if (typeof error !== 'object' || error === null || !('data' in error)) return undefined
  const data = error.data
  if (typeof data !== 'object' || data === null || !('code' in data)) return undefined
  return typeof data.code === 'string' ? data.code : undefined
}
