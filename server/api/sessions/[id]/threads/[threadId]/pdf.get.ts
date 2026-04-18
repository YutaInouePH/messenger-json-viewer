import { lookupSession, isExpired } from '../../../../../utils/sessionStore'
import PDFDocument from 'pdfkit'
import type { Message } from '../../../../../utils/types'

// ---- Layout constants (A4) ----
const PW = 595.28 // page width (pts)
const PH = 841.89 // page height (pts)
const MX = 40 // horizontal margin
const MT = 48 // top margin
const MB = 48 // bottom margin
const CW = PW - MX * 2 // usable content width
const MAX_BW = Math.round(CW * 0.67) // max bubble width

const BPX = 10 // bubble horizontal padding
const BPY = 7 // bubble vertical padding
const BR = 10 // bubble corner radius
const FS_TEXT = 9.5 // message text font size
const FS_META = 7.5 // metadata font size (sender name, timestamp, reactions)
const MSG_GAP = 8 // vertical gap between messages
const DATE_H = 30 // height block reserved for a date separator

// ---- Colours ----
const C_OWN_BG = '#0084FF'
const C_OWN_TEXT = '#FFFFFF'
const C_OTHER_BG = '#E4E6EB'
const C_OTHER_TEXT = '#1C1E21'
const C_META = '#65676B'
const C_LINE = '#CCD0D5'
const C_TITLE = '#1C1E21'

// ---- Helpers ----

function sanitizeFilename(name: string): string {
  return (name.replace(/[/\\?%*:|"<>]/g, '-').trim() || 'chat').slice(0, 100)
}

function getMessageLines(msg: Message): string[] {
  const lines: string[] = []
  if (msg.isUnsent) lines.push('[Message unsent]')
  if (msg.text) lines.push(msg.text)
  if (msg.type === 'Share' && !msg.text) lines.push('[Shared a link]')
  if (msg.type === 'Call') lines.push('[Call]')
  for (const asset of msg.media) {
    if (asset.mimeType.startsWith('image/')) lines.push('[Image]')
    else if (asset.mimeType.startsWith('video/')) lines.push('[Video]')
    else if (asset.mimeType.startsWith('audio/')) lines.push('[Audio message]')
    else lines.push(`[File: ${asset.uri.split('/').pop() ?? 'attachment'}]`)
  }
  if (lines.length === 0) lines.push('[No content]')
  return lines
}

export default defineEventHandler(async (event) => {
  const sessionId = getRouterParam(event, 'id')
  const threadId = getRouterParam(event, 'threadId')

  if (!sessionId) throw createError({ statusCode: 400, statusMessage: 'Missing session id' })
  if (!threadId) throw createError({ statusCode: 400, statusMessage: 'Missing thread id' })

  const index = lookupSession(sessionId)
  if (!index) throw createError({ statusCode: 404, statusMessage: 'Session not found' })
  if (isExpired(index)) throw createError({ statusCode: 410, statusMessage: 'Session expired' })

  const thread = index.threads.get(threadId)
  if (!thread) throw createError({ statusCode: 404, statusMessage: 'Thread not found' })

  const { threadName, participants } = thread.summary
  const selfName = participants.at(-1) ?? ''
  const messages: Message[] = thread.messages // chronological order

  // ---- Build the PDF ----
  const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true })
  const chunks: Buffer[] = []
  doc.on('data', (chunk: Buffer) => chunks.push(chunk))
  const pdfDone = new Promise<void>((resolve, reject) => {
    doc.on('end', resolve)
    doc.on('error', reject)
  })

  let curY = MT

  /** Add a new page and reset curY to top margin. */
  function addPage() {
    doc.addPage()
    curY = MT
  }

  /** Ensure at least `needed` pts remain on the current page; if not, add a page. */
  function ensureSpace(needed: number) {
    if (curY + needed > PH - MB) addPage()
  }

  /** Pre-calculate the height a bubble needs for its content lines. */
  function calcBubbleHeight(lines: string[], bubbleWidth: number): number {
    const textWidth = bubbleWidth - BPX * 2
    doc.font('Helvetica').fontSize(FS_TEXT)
    let h = BPY * 2
    for (const line of lines) {
      h += doc.heightOfString(line, { width: textWidth })
    }
    return Math.max(h, FS_TEXT + BPY * 2)
  }

  /** Draw a date-separator (two lines + centred date text). */
  function drawDateSeparator(dateStr: string) {
    ensureSpace(DATE_H)
    const midY = curY + DATE_H / 2
    doc.font('Helvetica').fontSize(FS_META)
    const textW = doc.widthOfString(dateStr)
    const textX = (PW - textW) / 2

    doc.strokeColor(C_LINE).lineWidth(0.5)
      .moveTo(MX, midY).lineTo(textX - 6, midY).stroke()

    doc.fillColor(C_META).text(dateStr, textX, midY - FS_META / 2, { lineBreak: false })

    doc.strokeColor(C_LINE).lineWidth(0.5)
      .moveTo(textX + textW + 6, midY).lineTo(PW - MX, midY).stroke()

    curY += DATE_H
  }

  /** Draw a single message bubble. */
  function drawMessage(msg: Message) {
    const isOwn = msg.senderName === selfName
    const lines = getMessageLines(msg)
    const bubbleW = Math.min(MAX_BW, CW)
    const bubbleH = calcBubbleHeight(lines, bubbleW)

    const senderH = isOwn ? 0 : FS_META + 4
    const reactionsH = msg.reactions.length > 0 ? FS_META + 5 : 0
    const totalH = senderH + bubbleH + reactionsH + FS_META + 6 + MSG_GAP

    ensureSpace(totalH)

    const bubbleX = isOwn ? PW - MX - bubbleW : MX

    // Sender name (other only)
    if (!isOwn) {
      doc.font('Helvetica').fontSize(FS_META).fillColor(C_META)
        .text(msg.senderName, bubbleX + BPX, curY, { width: bubbleW - BPX, lineBreak: false })
      curY += FS_META + 4
    }

    // Bubble background
    if (msg.isUnsent) {
      doc.roundedRect(bubbleX, curY, bubbleW, bubbleH, BR)
        .dash(3, { space: 3 }).strokeColor(C_LINE).stroke().undash()
    } else {
      doc.roundedRect(bubbleX, curY, bubbleW, bubbleH, BR)
        .fill(isOwn ? C_OWN_BG : C_OTHER_BG)
    }

    // Text lines inside bubble
    const textColor = msg.isUnsent ? C_META : (isOwn ? C_OWN_TEXT : C_OTHER_TEXT)
    const textX = bubbleX + BPX
    const textW = bubbleW - BPX * 2
    let textY = curY + BPY

    doc.font('Helvetica').fontSize(FS_TEXT).fillColor(textColor)
    for (const line of lines) {
      doc.text(line, textX, textY, { width: textW, lineBreak: true })
      textY = doc.y
    }

    curY += bubbleH

    // Reactions
    if (msg.reactions.length > 0) {
      const rxStr = msg.reactions.map(r => r.reaction).join(' ')
      doc.font('Helvetica').fontSize(FS_META + 1).fillColor(C_META)
        .text(rxStr, bubbleX + BPX, curY + 2, { width: bubbleW, lineBreak: false })
      curY += reactionsH
    }

    // Timestamp
    const timeStr = new Date(msg.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    })
    doc.font('Helvetica').fontSize(FS_META).fillColor(C_META)
    if (isOwn) {
      doc.text(timeStr, MX, curY + 2, { width: CW, align: 'right', lineBreak: false })
    } else {
      doc.text(timeStr, bubbleX + BPX, curY + 2, { width: bubbleW, lineBreak: false })
    }

    curY += FS_META + 4 + MSG_GAP
  }

  // ---- Render ----

  // Title block
  doc.font('Helvetica-Bold').fontSize(13).fillColor(C_TITLE)
    .text(threadName, MX, curY, { width: CW, align: 'center', lineBreak: false })
  curY += 18

  doc.font('Helvetica').fontSize(FS_META).fillColor(C_META)
    .text(participants.join(', '), MX, curY, { width: CW, align: 'center', lineBreak: false })
  curY += 14

  doc.strokeColor(C_LINE).lineWidth(0.5)
    .moveTo(MX, curY).lineTo(PW - MX, curY).stroke()
  curY += 14

  // Messages grouped by date
  let lastDate = ''
  for (const msg of messages) {
    const dateStr = new Date(msg.timestamp).toLocaleDateString([], {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })
    if (dateStr !== lastDate) {
      drawDateSeparator(dateStr)
      lastDate = dateStr
    }
    drawMessage(msg)
  }

  doc.end()
  await pdfDone

  const pdfBuffer = Buffer.concat(chunks)
  const filename = sanitizeFilename(threadName) + '.pdf'

  setHeader(event, 'Content-Type', 'application/pdf')
  setHeader(event, 'Content-Disposition', `attachment; filename="${filename}"`)
  setHeader(event, 'Content-Length', String(pdfBuffer.length))

  return pdfBuffer
})
