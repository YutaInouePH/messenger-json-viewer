import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const NONCE_MAX_AGE_MS = 5 * 60 * 1000
const DEFAULT_REALM = 'Messenger JSON Viewer'

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function quote(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function parseDigestAuthHeader(header: string): Record<string, string> {
  const params: Record<string, string> = {}
  const digest = header.replace(/^Digest\s+/i, '')
  const regex = /(\w+)=("([^"\\]|\\.)*"|[^,]+)/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(digest)) !== null) {
    const key = match[1]
    if (!key) continue
    const rawValue = (match[2] || '').trim()
    if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
      params[key] = rawValue.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    } else {
      params[key] = rawValue
    }
  }
  return params
}

function equalsConstantTime(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return timingSafeEqual(aBuf, bBuf)
}

function createNonce(secret: string): string {
  const timestamp = Date.now().toString()
  const random = randomBytes(16).toString('hex')
  const payload = `${timestamp}:${random}`
  const signature = createHmac('sha256', secret).update(payload).digest('hex')
  return `${payload}:${signature}`
}

function isValidNonce(nonce: string, secret: string): boolean {
  const parts = nonce.split(':')
  if (parts.length !== 3) return false
  const [timestamp, random, signature] = parts
  if (!timestamp || !random || !signature) return false
  const issuedAt = Number.parseInt(timestamp, 10)
  if (!Number.isFinite(issuedAt)) return false
  if (Date.now() - issuedAt > NONCE_MAX_AGE_MS) return false
  const payload = `${timestamp}:${random}`
  const expected = createHmac('sha256', secret).update(payload).digest('hex')
  return equalsConstantTime(signature, expected)
}

function getOpaque(secret: string, realm: string): string {
  return createHmac('sha256', secret).update(`opaque:${realm}`).digest('hex')
}

export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  const username = config.digestAuth?.username || process.env.DIGEST_AUTH_USERNAME
  const password = config.digestAuth?.password || process.env.DIGEST_AUTH_PASSWORD
  const realm = config.digestAuth?.realm || process.env.DIGEST_AUTH_REALM || DEFAULT_REALM
  const nonceSecret = config.digestAuth?.nonceSecret || process.env.DIGEST_AUTH_SECRET

  if (!username || !password || !nonceSecret) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Digest auth is not configured. Set DIGEST_AUTH_USERNAME, DIGEST_AUTH_PASSWORD, and DIGEST_AUTH_SECRET environment variables'
    })
  }

  if (equalsConstantTime(nonceSecret, password)) {
    throw createError({
      statusCode: 500,
      statusMessage: 'DIGEST_AUTH_SECRET must be different from DIGEST_AUTH_PASSWORD'
    })
  }

  const challenge = () => {
    const nonce = createNonce(nonceSecret)
    const opaque = getOpaque(nonceSecret, realm)
    const header = `Digest realm="${quote(realm)}", qop="auth", nonce="${nonce}", opaque="${opaque}", algorithm=SHA-256`
    setResponseStatus(event, 401, 'Unauthorized')
    setHeader(event, 'WWW-Authenticate', header)
    return 'Unauthorized'
  }

  const authHeader = getHeader(event, 'authorization') || ''
  if (!authHeader.startsWith('Digest ')) {
    return challenge()
  }

  const params = parseDigestAuthHeader(authHeader)
  const {
    username: requestUser,
    realm: requestRealm,
    nonce,
    uri,
    response,
    nc,
    cnonce,
    qop,
    opaque
  } = params

  if (!requestUser || !requestRealm || !nonce || !uri || !response) {
    return challenge()
  }

  const expectedOpaque = getOpaque(nonceSecret, realm)
  if (!opaque || !equalsConstantTime(opaque, expectedOpaque)) {
    return challenge()
  }

  if (!isValidNonce(nonce, nonceSecret)) {
    return challenge()
  }

  const requestUrl = event.node.req.url || '/'
  if (!equalsConstantTime(requestUser, username) || !equalsConstantTime(requestRealm, realm) || !equalsConstantTime(uri, requestUrl)) {
    return challenge()
  }

  const method = (event.node.req.method || 'GET').toUpperCase()
  const ha1 = hash(`${username}:${realm}:${password}`)
  const ha2 = hash(`${method}:${uri}`)
  const expectedResponse = qop
    ? hash(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : hash(`${ha1}:${nonce}:${ha2}`)

  if (!equalsConstantTime(response, expectedResponse)) {
    return challenge()
  }

  return
})
