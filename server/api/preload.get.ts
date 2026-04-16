import { lookupSession, isExpired, cleanupExpiredSessions } from '../utils/sessionStore'
import { processZipBuffer } from '../utils/processZip'

/** Fixed session ID used for the blob-preloaded session. */
const PRELOAD_SESSION_ID = 'blob-preloaded'

export default defineEventHandler(async (event) => {
  cleanupExpiredSessions()

  const { blobZipUrl } = useRuntimeConfig(event)
  if (!blobZipUrl) {
    return { configured: false }
  }

  // Return existing session if still valid
  const existing = lookupSession(PRELOAD_SESSION_ID)
  if (existing && !isExpired(existing)) {
    return {
      configured: true,
      sessionId: PRELOAD_SESSION_ID,
      expiresAt: existing.session.expiresAt,
      threadCount: existing.session.threadCount
    }
  }

  // Download the zip from the blob URL
  let buffer: Buffer
  try {
    const response = await fetch(blobZipUrl)
    if (!response.ok) {
      throw createError({
        statusCode: 502,
        statusMessage: `Failed to download blob zip: HTTP ${response.status}`
      })
    }
    buffer = Buffer.from(await response.arrayBuffer())
  } catch (err: unknown) {
    if ((err as { statusCode?: number }).statusCode) throw err
    throw createError({ statusCode: 502, statusMessage: 'Failed to download blob zip' })
  }

  // Process and register session
  const result = await processZipBuffer(buffer, PRELOAD_SESSION_ID)

  return {
    configured: true,
    sessionId: PRELOAD_SESSION_ID,
    expiresAt: result.expiresAt,
    threadCount: result.threadCount
  }
})
