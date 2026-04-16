import { lookupSession as getSession, isExpired, cleanupExpiredSessions } from '../../../utils/sessionStore'

export default defineEventHandler((event) => {
  cleanupExpiredSessions()

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing session id' })

  const index = getSession(id)
  if (!index) throw createError({ statusCode: 404, statusMessage: 'Session not found' })

  if (isExpired(index)) {
    throw createError({ statusCode: 410, statusMessage: 'Session expired' })
  }

  const query = getQuery(event)
  const search = typeof query.search === 'string' ? query.search.toLowerCase() : ''

  const threads = Array.from(index.threads.values())
    .map(t => t.summary)
    .filter(s =>
      !search
      || s.threadName.toLowerCase().includes(search)
      || s.participants.some(p => p.toLowerCase().includes(search))
    )
    .sort((a, b) => b.lastMessageAt - a.lastMessageAt)

  return { threads }
})
