import { randomUUID } from 'node:crypto'
import { cleanupExpiredSessions } from '../utils/sessionStore'
import { processZipBuffer } from '../utils/processZip'

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024 // 500 MB

export default defineEventHandler(async (event) => {
  // Opportunistic cleanup of expired sessions
  cleanupExpiredSessions()

  const contentType = getHeader(event, 'content-type') ?? ''
  if (!contentType.includes('multipart/form-data')) {
    throw createError({ statusCode: 400, statusMessage: 'Expected multipart/form-data' })
  }

  const formData = await readMultipartFormData(event)
  if (!formData) {
    throw createError({ statusCode: 400, statusMessage: 'No form data received' })
  }

  const filePart = formData.find(p => p.name === 'file')
  if (!filePart) {
    throw createError({ statusCode: 400, statusMessage: 'Missing "file" field in form data' })
  }

  const filename = filePart.filename ?? 'upload.zip'
  if (!filename.toLowerCase().endsWith('.zip')) {
    throw createError({ statusCode: 400, statusMessage: 'Only .zip files are accepted' })
  }

  if (filePart.data.byteLength > MAX_UPLOAD_BYTES) {
    throw createError({ statusCode: 413, statusMessage: `File exceeds ${MAX_UPLOAD_BYTES / 1024 / 1024} MB limit` })
  }

  const sessionId = randomUUID()
  const result = await processZipBuffer(Buffer.from(filePart.data), sessionId)

  return {
    sessionId,
    expiresAt: result.expiresAt,
    threadCount: result.threadCount,
    threads: result.threads
  }
})
