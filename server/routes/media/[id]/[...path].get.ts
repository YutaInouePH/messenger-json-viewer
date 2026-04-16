import { createReadStream, statSync } from 'node:fs'
import { resolve } from 'node:path'
import mime from 'mime'
import { lookupSession as getSession, isExpired } from '../../../utils/sessionStore'
import { safeJoin } from '../../../utils/parser'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const pathParam = getRouterParam(event, 'path')

  if (!id || !pathParam) {
    throw createError({ statusCode: 400, statusMessage: 'Missing parameters' })
  }

  const index = getSession(id)
  if (!index) throw createError({ statusCode: 404, statusMessage: 'Session not found' })

  if (isExpired(index)) {
    throw createError({ statusCode: 410, statusMessage: 'Session expired' })
  }

  const sessionDir = resolve(index.session.sessionDir)
  // pathParam may be a URL-encoded relative path to the media asset
  const decodedPath = decodeURIComponent(pathParam)
  const resolved = safeJoin(sessionDir, decodedPath)

  if (!resolved) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  let stat
  try {
    stat = statSync(resolved)
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'Media file not found' })
  }

  if (!stat.isFile()) {
    throw createError({ statusCode: 404, statusMessage: 'Not a file' })
  }

  const mimeType = mime.getType(resolved) || 'application/octet-stream'
  setHeader(event, 'Content-Type', mimeType)
  setHeader(event, 'Content-Length', String(stat.size))
  setHeader(event, 'Cache-Control', 'private, max-age=3600')

  return sendStream(event, createReadStream(resolved))
})
