import https from 'https'
import fs from 'fs'
import path from 'path'
import { getCacheDir } from '../utils/paths'

export class RatingHttpError extends Error {
  constructor(public status: number) { super(`Rating HTTP ${status}`) }
}

const queues = new Map<string, Promise<void>>()
const nextRequest = new Map<string, number>()
const requests = new Map<string, Promise<unknown>>()
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

// Reserve start times serially per host, including concurrent callers.
export function requestRatingJson<T>(url: string, body?: unknown): Promise<T> {
  const isForm = body instanceof URLSearchParams
  const payload = isForm ? body.toString() : body === undefined ? undefined : JSON.stringify(body)
  const key = `${url}:${isForm ? 'form' : 'json'}:${payload}`
  const pending = requests.get(key)
  if (pending) return pending as Promise<T>
  const host = new URL(url).hostname
  const gate = (queues.get(host) || Promise.resolve()).then(async () => {
    while ((nextRequest.get(host) || 0) > Date.now()) {
      await delay((nextRequest.get(host) || 0) - Date.now())
    }
    nextRequest.set(host, Date.now() + 1100)
  })
  queues.set(host, gate.catch(() => {}))
  const work = gate.then(() => new Promise<T>((resolve, reject) => {
    const req = https.request(url, {
      method: payload === undefined ? 'GET' : 'POST',
      headers: {
        'User-Agent': 'wdxw/GalController/1.0.0 (https://github.com/wdxw/galgame_control)',
        Accept: 'application/json',
        ...(payload ? { 'Content-Type': isForm ? 'application/x-www-form-urlencoded' : 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, res => {
      if (res.statusCode === 429) {
        const seconds = Number(res.headers['retry-after'])
        nextRequest.set(host, Date.now() + Math.min(60000, Math.max(5000, Number.isFinite(seconds) ? seconds * 1000 : 5000)))
      }
      if (res.statusCode !== 200) {
        res.resume()
        clearTimeout(timer)
        reject(new RatingHttpError(res.statusCode || 500))
        return
      }
      let data = ''
      res.setEncoding('utf8')
      res.on('data', chunk => {
        data += chunk
        if (data.length > 4 * 1024 * 1024) req.destroy(new Error('Rating response too large'))
      })
      res.on('error', error => { clearTimeout(timer); reject(error) })
      res.on('end', () => {
        clearTimeout(timer)
        try { resolve(JSON.parse(data) as T) } catch (error) { reject(error) }
      })
    })
    const timer = setTimeout(() => req.destroy(new Error('Rating request timed out')), 10000)
    req.on('error', error => { clearTimeout(timer); reject(error) })
    req.end(payload)
  })).finally(() => { requests.delete(key) })
  requests.set(key, work)
  return work
}

export interface CachedRating<T> { data: T; updatedAt: number; stale: boolean }
const cachedRequests = new Map<string, Promise<CachedRating<unknown>>>()
const TTL = 24 * 60 * 60 * 1000
function readCache(): Record<string, CachedRating<unknown>> {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(getCacheDir(), 'ratings-v1.json'), 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch { return {} }
}

export function cachedRating<T>(key: string, force: boolean, fetcher: () => Promise<T>): Promise<CachedRating<T>> {
  const pending = cachedRequests.get(key)
  if (pending) return pending as Promise<CachedRating<T>>
  const entry = readCache()[key] as CachedRating<T> | undefined
  const cached = entry && Number.isFinite(entry.updatedAt) && entry.data != null ? entry : undefined
  if (!force && cached && Date.now() - cached.updatedAt < TTL) return Promise.resolve({ ...cached, stale: false })
  const work = fetcher().then(data => {
    const fresh = { data, updatedAt: Date.now(), stale: false }
    try {
      const file = path.join(getCacheDir(), 'ratings-v1.json')
      fs.writeFileSync(file + '.tmp', JSON.stringify({ ...readCache(), [key]: fresh }))
      fs.renameSync(file + '.tmp', file)
    } catch { /* Cache persistence must not block ratings. */ }
    return fresh
  }).catch(error => {
    if (cached) return { ...cached, stale: true }
    throw error
  }).finally(() => { cachedRequests.delete(key) })
  cachedRequests.set(key, work)
  return work
}
