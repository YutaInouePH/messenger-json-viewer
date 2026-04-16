import { createWriteStream, mkdirSync, readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { pipeline } from 'node:stream/promises'
import unzipper from 'unzipper'
import { setSession, getSessionTTL } from './sessionStore'
import { parseThreadJson, mergeThreadChunks } from './parser'
import type { ImportSession, SessionIndex, ThreadSummary } from './types'

/** Recursively find all Messenger JSON files (e.g. message_1.json or "First Last _47.json") */
export function findMessageJsonFiles(dir: string): string[] {
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

export interface ProcessZipResult {
  expiresAt: number
  threadCount: number
  threads: ThreadSummary[]
}

/**
 * Extract, parse, and register a zip buffer as a session.
 * @param buffer  Raw zip file bytes
 * @param sessionId  Session ID to register under
 */
export async function processZipBuffer(buffer: Buffer, sessionId: string): Promise<ProcessZipResult> {
  const sessionDir = join(tmpdir(), 'messenger-sessions', sessionId)
  mkdirSync(sessionDir, { recursive: true })

  // Write zip to temp file
  const zipPath = join(sessionDir, 'upload.zip')
  writeFileSync(zipPath, buffer)

  // Unzip with path traversal protection
  try {
    const directory = await unzipper.Open.file(zipPath)
    for (const file of directory.files) {
      if (file.type === 'Directory') continue
      const safeName = file.path.replace(/\.\./g, '').replace(/^[/\\]+/, '')
      const destPath = join(sessionDir, safeName)
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

  interface ParsedFile { file: string, parsed: ReturnType<typeof parseThreadJson> }
  const parsedFiles: ParsedFile[] = []
  for (const file of jsonFiles) {
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(file, 'utf-8'))
    } catch {
      continue
    }
    const parsed = parseThreadJson(raw, sessionDir)
    if (parsed) parsedFiles.push({ file, parsed })
  }

  // Group by (parent directory, thread name) to merge Facebook multi-chunk threads
  const threadGroups = new Map<string, typeof parsedFiles>()
  for (const item of parsedFiles) {
    const key = `${dirname(item.file)}\0${item.parsed!.summary.threadName}`
    const group = threadGroups.get(key) ?? []
    group.push(item)
    threadGroups.set(key, group)
  }

  const threadMap = new Map<string, ReturnType<typeof mergeThreadChunks>>()

  for (const [, items] of threadGroups.entries()) {
    const chunks = items.map(i => i.parsed!)
    const firstFile = items[0]!.file
    const folderName = basename(dirname(firstFile))
    const threadName = chunks[0]!.summary.threadName
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
    expiresAt: session.expiresAt,
    threadCount: session.threadCount,
    threads: Array.from(threadMap.values()).map(t => t.summary)
  }
}
