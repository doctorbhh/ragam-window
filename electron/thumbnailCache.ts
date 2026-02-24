import { protocol } from 'electron'
import https from 'node:https'
import http from 'node:http'

const MAX_CACHE_SIZE = 500
const MAX_CONCURRENT = 3
const DELAY_BETWEEN_MS = 200

const cache = new Map<string, Buffer>()
const cacheOrder: string[] = []
let activeRequests = 0
const queue: Array<{
  url: string
  resolve: (buf: Buffer) => void
  reject: (err: Error) => void
  retries: number
  backoff: number
}> = []

function evictIfNeeded() {
  while (cache.size > MAX_CACHE_SIZE && cacheOrder.length > 0) {
    const oldest = cacheOrder.shift()!
    cache.delete(oldest)
  }
}

function processQueue() {
  while (activeRequests < MAX_CONCURRENT && queue.length > 0) {
    const item = queue.shift()!
    activeRequests++
    doFetch(item)
  }
}

function doFetch(item: typeof queue[0]) {
  const parsedUrl = new URL(item.url)
  const client = parsedUrl.protocol === 'https:' ? https : http

  const req = client.get(item.url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9'
    },
    timeout: 10000
  }, (response) => {
    const statusCode = response.statusCode || 0

    if (statusCode === 429 || statusCode === 503) {
      response.resume()
      activeRequests--
      if (item.retries > 0) {
        console.log(`[ThumbCache] ${statusCode} → retry in ${item.backoff}ms (${item.retries} left)`)
        setTimeout(() => {
          item.retries--
          item.backoff = Math.min(item.backoff * 2, 30000)
          queue.unshift(item)
          processQueue()
        }, item.backoff)
      } else {
        item.reject(new Error(`Rate limited after all retries`))
        scheduleNext()
      }
      return
    }

    if (statusCode === 301 || statusCode === 302 || statusCode === 303 || statusCode === 307) {
      response.resume()
      activeRequests--
      const redirectUrl = response.headers.location
      if (redirectUrl && item.retries > 0) {
        item.url = redirectUrl
        item.retries--
        queue.unshift(item)
        processQueue()
      } else {
        item.reject(new Error(`Too many redirects`))
        scheduleNext()
      }
      return
    }

    if (statusCode !== 200) {
      response.resume()
      activeRequests--
      item.reject(new Error(`HTTP ${statusCode}`))
      scheduleNext()
      return
    }

    const chunks: Buffer[] = []
    response.on('data', (chunk) => {
      chunks.push(Buffer.from(chunk))
    })

    response.on('end', () => {
      const buffer = Buffer.concat(chunks)
      cache.set(item.url, buffer)
      cacheOrder.push(item.url)
      evictIfNeeded()
      activeRequests--
      item.resolve(buffer)
      scheduleNext()
    })

    response.on('error', (err) => {
      activeRequests--
      item.reject(err)
      scheduleNext()
    })
  })

  req.on('timeout', () => {
    req.destroy()
    activeRequests--
    if (item.retries > 0) {
      item.retries--
      item.backoff = Math.min(item.backoff * 2, 30000)
      queue.unshift(item)
      setTimeout(processQueue, item.backoff)
    } else {
      item.reject(new Error('Timeout'))
      scheduleNext()
    }
  })

  req.on('error', (err) => {
    activeRequests--
    if (item.retries > 0) {
      setTimeout(() => {
        item.retries--
        item.backoff = Math.min(item.backoff * 2, 30000)
        queue.unshift(item)
        processQueue()
      }, item.backoff)
    } else {
      item.reject(err)
      scheduleNext()
    }
  })
}

function scheduleNext() {
  if (queue.length > 0) {
    setTimeout(processQueue, DELAY_BETWEEN_MS)
  }
}

function fetchWithQueue(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    queue.push({ url, resolve, reject, retries: 3, backoff: 2000 })
    processQueue()
  })
}

export function registerThumbProtocol() {
  protocol.handle('thumb-cache', async (request) => {
    try {
      const originalUrl = decodeURIComponent(request.url.replace('thumb-cache://', ''))

      if (cache.has(originalUrl)) {
        return new Response(cache.get(originalUrl)!, {
          headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'max-age=604800' }
        })
      }

      const buffer = await fetchWithQueue(originalUrl)
      return new Response(buffer, {
        headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'max-age=604800' }
      })
    } catch (err: any) {
      console.error('[ThumbCache] Failed:', err.message?.substring(0, 80))
      return new Response('', { status: 502 })
    }
  })

  console.log('[ThumbCache] Protocol registered (cookie-free Node.js fetching)')
}

export function toThumbUrl(url: string): string {
  if (!url) return ''
  if (url.includes('googleusercontent.com') || url.includes('ggpht.com')) {
    return `thumb-cache://${encodeURIComponent(url)}`
  }
  return url
}
