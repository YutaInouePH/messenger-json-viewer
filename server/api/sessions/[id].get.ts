import { lookupSession as getSession, isExpired, cleanupExpiredSessions } from '../../utils/sessionStore'

export default defineEventHandler((event) => {
  cleanupExpiredSessions()

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing session id' })

  const index = getSession(id)
  if (!index) throw createError({ statusCode: 404, statusMessage: 'Session not found' })

  if (isExpired(index)) {
    throw createError({ statusCode: 410, statusMessage: 'Session expired' })
  }

  const { session } = index
  return {
    sessionId: session.id,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    status: session.status,
    threadCount: session.threadCount
  }
})
