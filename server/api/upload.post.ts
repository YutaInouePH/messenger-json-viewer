import { createWriteStream, mkdirSync, readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs'
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

/** Recursively find all Messenger JSON files (e.g. message_1.json or "First Last _47.json") inside sessionDir */
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
    } else if (/^.+_\d+\.json$/i.test(basename(full))) {
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
      if (!destPath.startsWith(sessionDir + '/')) continue
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

  // Parse each JSON file first, then group chunks by (directory + threadName).
  // This correctly handles both:
  //   - Facebook raw format: multiple message_N.json files in one folder share the same title → merged as chunks
  //   - Pre-processed format: each file is its own thread in a flat folder → kept separate
  interface ParsedFile { file: string, parsed: ReturnType<typeof parseThreadJson> }
  const parsedFiles: ParsedFile[] = []
  for (const file of jsonFiles) {
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(file, 'utf-8'))
    } catch {
      continue // skip malformed JSON
    }
    const parsed = parseThreadJson(raw, sessionDir)
    if (parsed) parsedFiles.push({ file, parsed })
  }

  // Group by (parent directory, thread name) so chunks of the same Facebook thread are merged
  // while distinct threads that happen to live in the same directory stay separate.
  const threadGroups = new Map<string, typeof parsedFiles>()
  for (const item of parsedFiles) {
    const key = `${dirname(item.file)}\0${item.parsed!.summary.threadName}`
    const group = threadGroups.get(key) ?? []
    group.push(item)
    threadGroups.set(key, group)
  }

  const threadMap = new Map<string, ReturnType<typeof mergeThreadChunks>>()

  for (const [key, items] of threadGroups.entries()) {
    const chunks = items.map(i => i.parsed!)
    // Derive a stable thread id: use the folder name for folder-per-thread layouts,
    // or the threadName slug for flat layouts where multiple threads share a directory.
    const firstFile = items[0]!.file
    const folderName = basename(dirname(firstFile))
    const threadName = chunks[0]!.summary.threadName
    // If all files in this group are the only file in their directory, use the filename stem as id.
    const siblingsInDir = parsedFiles.filter(p => dirname(p.file) === dirname(firstFile))
    const threadId = siblingsInDir.length > 1
      ? `${folderName}_${threadName.replace(/[^a-z0-9]/gi, '_')}`
      : folderName
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
