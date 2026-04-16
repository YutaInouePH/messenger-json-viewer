import { mkdirSync, readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import unzipper from 'unzipper'
import {
  setSession,
  getSessionTTL,
  cleanupExpiredSessions
} from '../utils/sessionStore'
import { parseThreadJson, mergeThreadChunks } from '../utils/parser'
import type { ImportSession, SessionIndex } from '../utils/types'

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024 // 500 MB

/** Recursively find all message_*.json files inside sessionDir */
function findMessageJsonFiles(dir: string): string[] {
  const results: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return results
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      results.push(...findMessageJsonFiles(full))
    } else if (/^message_\d+\.json$/i.test(basename(full))) {
      results.push(full)
    }
  }
  return results
}

export default defineEventHandler(async (event) => {
  // Opportunistic cleanup of expired sessions
  cleanupExpiredSessions()

  const contentType = getHeader(event, 'content-type') ?? ''
  if (!contentType.includes('multipart/form-data')) {
    throw createError({ statusCode: 400, statusMessage: 'Expected multipart/form-data' })
  }

  // Parse multipart
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
  const sessionDir = join(tmpdir(), 'messenger-sessions', sessionId)
  mkdirSync(sessionDir, { recursive: true })

  // Write zip to temp file
  const zipPath = join(sessionDir, 'upload.zip')
  writeFileSync(zipPath, filePart.data)

  // Unzip with path traversal protection
  try {
    const directory = await unzipper.Open.file(zipPath)
    for (const file of directory.files) {
      if (file.type === 'Directory') continue
      // Sanitize entry path
      const safeName = file.path.replace(/\.\./g, '').replace(/^[/\\]+/, '')
      const destPath = join(sessionDir, safeName)
      // Ensure dest is inside sessionDir
      if (!destPath.startsWith(sessionDir + '/') && destPath !== sessionDir) continue
      mkdirSync(dirname(destPath), { recursive: true })
      const writeStream = createWriteStream(destPath)
      await pipeline(file.stream(), writeStream)
    }
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Failed to extract zip: file may be corrupt or invalid' })
  }

  // Discover and parse message JSON files
  const jsonFiles = findMessageJsonFiles(sessionDir)
  if (jsonFiles.length === 0) {
    throw createError({ statusCode: 422, statusMessage: 'No Messenger JSON files found in the uploaded zip' })
  }

  // Group files by thread directory
  const threadGroups = new Map<string, string[]>()
  for (const file of jsonFiles) {
    const threadDir = dirname(file)
    const group = threadGroups.get(threadDir) ?? []
    group.push(file)
    threadGroups.set(threadDir, group)
  }

  const threadMap = new Map<string, ReturnType<typeof mergeThreadChunks>>()

  for (const [threadDir, files] of threadGroups.entries()) {
    const chunks = []
    for (const file of files) {
      let raw: unknown
      try {
        raw = JSON.parse(readFileSync(file, 'utf-8'))
      } catch {
        continue // skip malformed JSON
      }
      const parsed = parseThreadJson(raw, sessionDir)
      if (parsed) chunks.push(parsed)
    }
    if (chunks.length === 0) continue

    // Use last segment of threadDir as thread id
    const threadId = basename(threadDir)
    const merged = mergeThreadChunks(chunks, threadId)
    threadMap.set(threadId, merged)
  }

  if (threadMap.size === 0) {
    throw createError({ statusCode: 422, statusMessage: 'Could not parse any valid Messenger threads from the zip' })
  }

  const now = Date.now()
  const session: ImportSession = {
    id: sessionId,
    createdAt: now,
    expiresAt: now + getSessionTTL(),
    status: 'active',
    threadCount: threadMap.size,
    sessionDir
  }

  const index: SessionIndex = {
    session,
    threads: threadMap
  }

  setSession(sessionId, index)

  return {
    sessionId,
    expiresAt: session.expiresAt,
    threadCount: session.threadCount,
    threads: Array.from(threadMap.values()).map(t => t.summary)
  }
})
