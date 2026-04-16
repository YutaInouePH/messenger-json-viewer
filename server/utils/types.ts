export type SessionStatus = 'active' | 'expired' | 'processing' | 'error'

export interface ImportSession {
  id: string
  createdAt: number
  expiresAt: number
  status: SessionStatus
  threadCount: number
  sessionDir: string
}

export interface ThreadSummary {
  id: string
  threadName: string
  participants: string[]
  lastMessageAt: number
  messageCount: number
}

export interface MediaAsset {
  uri: string
  resolvedPath: string
  mimeType: string
  size: number
}

export interface Reaction {
  reaction: string
  actor: string
}

export type MessageType = 'Generic' | 'Share' | 'Call' | 'Subscribe' | 'Unsubscribe' | string

export interface Message {
  id: string
  senderName: string
  text: string | null
  timestamp: number
  type: MessageType
  media: MediaAsset[]
  reactions: Reaction[]
  isUnsent: boolean
}

export interface ThreadIndex {
  summary: ThreadSummary
  messages: Message[]
}

export interface SessionIndex {
  session: ImportSession
  threads: Map<string, ThreadIndex>
}

// Raw Facebook Messenger JSON format
export interface RawParticipant {
  name: string
}

export interface RawMedia {
  uri: string
  creation_timestamp?: number
  thumbnail?: { uri: string }
}

export interface RawReaction {
  reaction: string
  actor: string
}

export interface RawMessage {
  sender_name: string
  timestamp_ms: number
  content?: string
  type: string
  is_unsent?: boolean
  reactions?: RawReaction[]
  photos?: RawMedia[]
  videos?: RawMedia[]
  audio_files?: RawMedia[]
  files?: RawMedia[]
  gifs?: RawMedia[]
  sticker?: RawMedia
  share?: { link?: string, share_text?: string }
}

export interface RawThread {
  participants: RawParticipant[]
  messages: RawMessage[]
  title?: string
  thread_type?: string
  thread_path?: string
  is_still_participant?: boolean
  magic_words?: unknown[]
}
