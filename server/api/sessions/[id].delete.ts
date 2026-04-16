import { lookupSession as getSession, deleteSession, isExpired } from '../../utils/sessionStore'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing session id' })

  const index = getSession(id)
  if (!index) throw createError({ statusCode: 404, statusMessage: 'Session not found' })

  if (isExpired(index)) {
    deleteSession(id)
    throw createError({ statusCode: 410, statusMessage: 'Session expired' })
  }

  deleteSession(id)
  return { success: true }
})
