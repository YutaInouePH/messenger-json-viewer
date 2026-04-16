import { statSync } from 'node:fs'
import { resolve, join, normalize } from 'node:path'
import mime from 'mime'
import type {
  RawThread,
  RawMessage,
  RawMedia,
  Message,
  MediaAsset,
  Reaction,
  ThreadSummary,
  ThreadIndex
} from './types'

let _msgIdCounter = 0
function nextMsgId(): string {
  return String(++_msgIdCounter)
}

function decodeText(text: string | null | undefined): string | null {
  if (!text) return null
  // Facebook JSON uses latin1-encoded UTF-8 for text – decode it
  try {
    return decodeURIComponent(escape(text))
  } catch {
    return text
  }
}

function resolveMedia(raw: RawMedia, sessionDir: string): MediaAsset | null {
  if (!raw?.uri) return null
  // uri is relative to the zip root, e.g. "messages/inbox/friend_123/photos/img.jpg"
  const rel = normalize(raw.uri).replace(/^\/+/, '')
  // Guard against path traversal
  const resolved = resolve(sessionDir, rel)
  if (!resolved.startsWith(sessionDir + '/')) return null

  let size = 0
  try {
    const stat = statSync(resolved)
    size = stat.size
  } catch {
    // file might not exist (corrupt zip or wrong path)
  }

  const mimeType = mime.getType(resolved) || 'application/octet-stream'
  return { uri: raw.uri, resolvedPath: resolved, mimeType, size }
}

function collectMedia(msg: RawMessage, sessionDir: string): MediaAsset[] {
  const assets: MediaAsset[] = []
  for (const arr of [msg.photos, msg.videos, msg.audio_files, msg.files, msg.gifs]) {
    if (!arr) continue
    for (const item of arr) {
      const a = resolveMedia(item, sessionDir)
      if (a) assets.push(a)
    }
  }
  if (msg.sticker) {
    const a = resolveMedia(msg.sticker, sessionDir)
    if (a) assets.push(a)
  }
  return assets
}

function normalizeMessage(raw: RawMessage, sessionDir: string): Message {
  const reactions: Reaction[] = (raw.reactions ?? []).map(r => ({
    reaction: decodeText(r.reaction) ?? r.reaction,
    actor: decodeText(r.actor) ?? r.actor
  }))

  // Support both Facebook raw (content, sender_name, timestamp_ms, is_unsent)
  // and pre-processed camelCase format (text, senderName, timestamp, isUnsent)
  const rawSenderName = raw.sender_name ?? raw.senderName ?? ''
  const rawTimestamp = raw.timestamp_ms ?? raw.timestamp ?? 0
  const rawIsUnsent = raw.is_unsent ?? raw.isUnsent ?? false

  let text: string | null = decodeText(raw.content ?? raw.text ?? null)
  if (!text && raw.share?.share_text) text = decodeText(raw.share.share_text)
  if (!text && raw.share?.link) text = raw.share.link

  return {
    id: nextMsgId(),
    senderName: decodeText(rawSenderName) ?? rawSenderName,
    text,
    timestamp: rawTimestamp,
    type: raw.type ?? 'Generic',
    media: collectMedia(raw, sessionDir),
    reactions,
    isUnsent: rawIsUnsent
  }
}

/**
 * Validate and parse a raw JSON object as a Messenger thread.
 * Returns null if the structure is not recognizable.
 */
export function parseThreadJson(raw: unknown, sessionDir: string): ThreadIndex | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>

  if (!Array.isArray(obj.messages)) return null
  if (!Array.isArray(obj.participants)) return null

  const thread = obj as RawThread

  // Participants can be objects {name} (Facebook raw) or plain strings (pre-processed)
  const participants: string[] = thread.participants
    .map(p => (typeof p === 'string' ? p : p.name))
    .filter((name): name is string => typeof name === 'string' && name.length > 0)
    .map(name => decodeText(name) ?? name)

  // Support both Facebook raw `title` and pre-processed `threadName`
  const rawTitle = thread.title ?? thread.threadName
  const title = rawTitle
    ? (decodeText(rawTitle) ?? rawTitle)
    : participants.join(', ') || 'Unknown Thread'

  const messages: Message[] = thread.messages.map(m => normalizeMessage(m, sessionDir))
  // Sort ascending by timestamp
  messages.sort((a, b) => a.timestamp - b.timestamp)

  const lastMsg = messages.at(-1)

  const summary: ThreadSummary = {
    id: '', // filled in by caller
    threadName: title,
    participants,
    lastMessageAt: lastMsg?.timestamp ?? 0,
    messageCount: messages.length
  }

  return { summary, messages }
}

/**
 * Merge multiple parsed thread chunks (message_1.json, message_2.json …)
 * that belong to the same thread folder into one unified ThreadIndex.
 */
export function mergeThreadChunks(chunks: ThreadIndex[], threadId: string): ThreadIndex {
  const first = chunks[0]!
  const allMessages: Message[] = chunks.flatMap(c => c.messages)
  allMessages.sort((a, b) => a.timestamp - b.timestamp)

  const lastMsg = allMessages.at(-1)
  const summary: ThreadSummary = {
    id: threadId,
    threadName: first.summary.threadName,
    participants: first.summary.participants,
    lastMessageAt: lastMsg?.timestamp ?? 0,
    messageCount: allMessages.length
  }

  return { summary, messages: allMessages }
}

/**
 * Safe path join that ensures the result stays inside rootDir.
 */
export function safeJoin(rootDir: string, ...parts: string[]): string | null {
  const joined = join(rootDir, ...parts)
  const resolved = resolve(joined)
  if (!resolved.startsWith(resolve(rootDir) + '/')) return null
  return resolved
}
