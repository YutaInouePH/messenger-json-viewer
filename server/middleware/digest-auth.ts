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

interface NonceCheckResult {
  valid: boolean
  stale: boolean
}

/**
 * Checks the structural validity, HMAC signature, and freshness of a nonce.
 * Returns { valid: true } when the nonce is acceptable.
 * Returns { valid: false, stale: true } when the signature is correct but the nonce has expired,
 * so the caller can issue a stale=true challenge and let the browser retry without re-prompting.
 * Returns { valid: false, stale: false } for a malformed or tampered nonce.
 */
function checkNonce(nonce: string, secret: string): NonceCheckResult {
  const parts = nonce.split(':')
  if (parts.length !== 3) return { valid: false, stale: false }
  const [timestamp, random, signature] = parts
  if (!timestamp || !random || !signature) return { valid: false, stale: false }
  const issuedAt = Number.parseInt(timestamp, 10)
  if (!Number.isFinite(issuedAt)) return { valid: false, stale: false }
  const payload = `${timestamp}:${random}`
  const expected = createHmac('sha256', secret).update(payload).digest('hex')
  if (!equalsConstantTime(signature, expected)) return { valid: false, stale: false }
  if (Date.now() - issuedAt > NONCE_MAX_AGE_MS) return { valid: false, stale: true }
  return { valid: true, stale: false }
}

function getOpaque(secret: string, realm: string): string {
  return createHmac('sha256', secret).update(`opaque:${realm}`).digest('hex')
}

/**
 * Canonicalize a request-target URI for comparison purposes.
 * Accepts absolute-URI form (http://host/path?query) used by some HTTP clients
 * and origin-form (/path?query) used by browsers. Returns the origin-form path+query.
 * HA2 is still computed with the client's original uri value as required by RFC 7616.
 */
function canonicalizeRequestUri(uri: string): string {
  if (/^https?:\/\//i.test(uri)) {
    try {
      const url = new URL(uri)
      return url.pathname + (url.search || '')
    } catch {
      // fall through and return as-is
    }
  }
  return uri
}

export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  const username = config.digestAuth?.username || process.env.DIGEST_AUTH_USERNAME
  const password = config.digestAuth?.password || process.env.DIGEST_AUTH_PASSWORD
  const realm = config.digestAuth?.realm || process.env.DIGEST_AUTH_REALM || DEFAULT_REALM
  const nonceSecret = config.digestAuth?.nonceSecret || process.env.DIGEST_AUTH_SECRET
  const debugMode = process.env.DIGEST_AUTH_DEBUG === '1'

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

  function debugLog(stage: string, detail: string): void {
    if (debugMode) {
      console.debug(`[digest-auth] ${stage}: ${detail}`)
    }
  }

  function challenge(stale = false): string {
    const nonce = createNonce(nonceSecret!)
    const opaque = getOpaque(nonceSecret!, realm)
    const staleParam = stale ? ', stale=true' : ''
    const header = `Digest realm="${quote(realm)}", qop="auth", nonce="${nonce}", opaque="${opaque}", algorithm=SHA-256${staleParam}`
    setResponseStatus(event, 401, 'Unauthorized')
    setHeader(event, 'WWW-Authenticate', header)
    return 'Unauthorized'
  }

  // Stage 1: Authorization header must be present and use the Digest scheme.
  const authHeader = getHeader(event, 'authorization') || ''
  if (!authHeader.startsWith('Digest ')) {
    debugLog('missing-auth', `method=${event.node.req.method} url=${event.node.req.url}`)
    return challenge()
  }

  // Stage 2: Parse and validate required fields.
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
    opaque,
    algorithm
  } = params

  if (!requestUser || !requestRealm || !nonce || !uri || !response) {
    debugLog('malformed', `missing fields: user=${!!requestUser} realm=${!!requestRealm} nonce=${!!nonce} uri=${!!uri} response=${!!response}`)
    return challenge()
  }

  // Stage 3: Validate algorithm — SHA-256 is required and is the only supported value.
  // We always advertise algorithm=SHA-256 in the challenge, so a compliant client must
  // echo it back. Rejecting absent or different algorithm values prevents downgrade confusion.
  if (!algorithm || algorithm.toUpperCase() !== 'SHA-256') {
    debugLog('bad-algorithm', `unsupported algorithm="${algorithm}"`)
    return challenge()
  }

  // Stage 4: Validate qop — only "auth" is supported; nc and cnonce are required when qop is present.
  if (qop) {
    if (qop !== 'auth') {
      debugLog('bad-qop', `unsupported qop="${qop}"`)
      return challenge()
    }
    if (!nc || !cnonce) {
      debugLog('bad-qop', 'nc and cnonce required when qop=auth')
      return challenge()
    }
  }

  // Stage 5: Validate opaque.
  const expectedOpaque = getOpaque(nonceSecret, realm)
  if (!opaque || !equalsConstantTime(opaque, expectedOpaque)) {
    debugLog('bad-opaque', 'opaque mismatch or missing')
    return challenge()
  }

  // Stage 6: Validate nonce integrity and freshness.
  // A structurally valid but expired nonce triggers stale=true so the browser
  // can retry silently with the new nonce rather than re-prompting the user.
  const nonceResult = checkNonce(nonce, nonceSecret)
  if (!nonceResult.valid) {
    debugLog('bad-nonce', `stale=${nonceResult.stale}`)
    return challenge(nonceResult.stale)
  }

  // Stage 7: Validate username and realm (constant-time to resist timing attacks).
  if (!equalsConstantTime(requestUser, username) || !equalsConstantTime(requestRealm, realm)) {
    debugLog('bad-credentials', 'username or realm mismatch')
    return challenge()
  }

  // Stage 8: Validate request URI.
  // Both sides are canonicalized to origin-form before comparison so that clients
  // sending an absolute-URI (http://host/path) are accepted. The raw client uri
  // is preserved for HA2 computation as required by RFC 7616.
  const requestUrl = event.node.req.url || '/'
  const canonicalClientUri = canonicalizeRequestUri(uri)
  const canonicalRequestUrl = canonicalizeRequestUri(requestUrl)
  if (!equalsConstantTime(canonicalClientUri, canonicalRequestUrl)) {
    debugLog('uri-mismatch', `client="${canonicalClientUri}" request="${canonicalRequestUrl}"`)
    return challenge()
  }

  // Stage 9: Validate the digest response hash.
  const method = (event.node.req.method || 'GET').toUpperCase()
  const ha1 = hash(`${username}:${realm}:${password}`)
  const ha2 = hash(`${method}:${uri}`)
  const expectedResponse = qop
    ? hash(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : hash(`${ha1}:${nonce}:${ha2}`)

  if (!equalsConstantTime(response, expectedResponse)) {
    debugLog('bad-response', `method=${method} uri=${uri}`)
    return challenge()
  }

  return
})
