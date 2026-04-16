import { lookupSession as getSession, isExpired } from '../../../../../utils/sessionStore'

const DEFAULT_PAGE_SIZE = 50

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  const threadId = getRouterParam(event, 'threadId')

  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing session id' })
  if (!threadId) throw createError({ statusCode: 400, statusMessage: 'Missing thread id' })

  const index = getSession(id)
  if (!index) throw createError({ statusCode: 404, statusMessage: 'Session not found' })

  if (isExpired(index)) {
    throw createError({ statusCode: 410, statusMessage: 'Session expired' })
  }

  const thread = index.threads.get(threadId)
  if (!thread) throw createError({ statusCode: 404, statusMessage: 'Thread not found' })

  const query = getQuery(event)
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || DEFAULT_PAGE_SIZE))

  const total = thread.messages.length
  const totalPages = Math.ceil(total / pageSize)
  // Messages are stored ascending; return most-recent page first by reversing
  const reversed = [...thread.messages].reverse()
  const start = (page - 1) * pageSize
  const end = start + pageSize
  const messages = reversed.slice(start, end).reverse()

  return {
    threadId,
    threadName: thread.summary.threadName,
    participants: thread.summary.participants,
    page,
    pageSize,
    totalPages,
    totalMessages: total,
    messages
  }
})
