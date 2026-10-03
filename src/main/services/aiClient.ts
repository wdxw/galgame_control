// Chat Completions compatible client. Requests are queued so entering worlds
// never floods a slow service, and the API key is encrypted before it is stored.

import { safeStorage } from 'electron'
import { getSetting, setSetting } from './library.db'
import type { AiStatus } from '../../shared/types'

const REQUEST_TIMEOUT_MS = 20000
const QUEUE_LIMIT = 24
let sessionKey = ''

export interface AiConfig {
  baseUrl: string
  model: string
  autoAnalyze: boolean
  keySet: boolean
}

function normalizeEndpoint(raw: string): string {
  const value = raw.trim().replace(/\/+$/, '')
  if (!value) return ''
  if (/\/chat\/completions$/.test(value)) return value
  return value + '/chat/completions'
}

export function getAiConfig(): AiConfig {
  const baseUrl = getSetting('aiBaseUrl') || ''
  const model = getSetting('aiModel') || ''
  return {
    baseUrl,
    model,
    autoAnalyze: getSetting('aiAutoAnalyze') === 'true',
    keySet: !!sessionKey || !!getSetting('aiKey')
  }
}

export function getAiStatus(): AiStatus {
  const config = getAiConfig()
  return { baseUrl: config.baseUrl, model: config.model, autoAnalyze: config.autoAnalyze, keySet: config.keySet }
}

/** The key never leaves the main process; empty string clears it. */
export function saveAiSettings(input: { baseUrl?: unknown; model?: unknown; apiKey?: unknown; autoAnalyze?: unknown }): AiStatus {
  if (typeof input.baseUrl === 'string') {
    const value = input.baseUrl.trim().slice(0, 500)
    if (value && !/^https?:\/\//i.test(value)) throw new Error('AI 服务地址需要以 http:// 或 https:// 开头')
    setSetting('aiBaseUrl', value)
  }
  if (typeof input.model === 'string') setSetting('aiModel', input.model.trim().slice(0, 200))
  if (typeof input.autoAnalyze === 'boolean') setSetting('aiAutoAnalyze', String(input.autoAnalyze))
  if (typeof input.apiKey === 'string') {
    const key = input.apiKey.trim()
    if (!key) {
      sessionKey = ''
      setSetting('aiKey', '')
      setSetting('aiKeyEnc', '')
    } else if (safeStorage.isEncryptionAvailable()) {
      sessionKey = ''
      setSetting('aiKey', safeStorage.encryptString(key).toString('base64'))
      setSetting('aiKeyEnc', 'os')
    } else {
      // Without an OS keyring, retain the key only for this application session.
      sessionKey = key
      setSetting('aiKey', '')
      setSetting('aiKeyEnc', 'session')
    }
  }
  return getAiStatus()
}

function readApiKey(): string {
  if (sessionKey) return sessionKey
  const stored = getSetting('aiKey')
  if (!stored) return ''
  try {
    if (getSetting('aiKeyEnc') === 'os') return safeStorage.decryptString(Buffer.from(stored, 'base64'))
    const legacyKey = Buffer.from(stored, 'base64').toString('utf8')
    // Upgrade keys written by the older base64 fallback.
    saveAiSettings({ apiKey: legacyKey })
    return legacyKey
  } catch { return '' }
}

export function aiKeyEncrypted(): boolean {
  return getSetting('aiKeyEnc') === 'os'
}

export function aiConfigured(): boolean {
  const config = getAiConfig()
  return !!normalizeEndpoint(config.baseUrl) && !!config.model
}

interface QueueEntry { run: () => Promise<unknown> }
const queue: QueueEntry[] = []
let running = false

async function drain(): Promise<void> {
  if (running) return
  running = true
  while (queue.length) {
    const entry = queue.shift()!
    try { await entry.run() } catch { /* Failures surface through the entry's own promise. */ }
  }
  running = false
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  if (queue.length >= QUEUE_LIMIT) return Promise.reject(new Error('AI 请求队列已满，请稍后重试'))
  return new Promise<T>((resolve, reject) => {
    queue.push({ run: () => task().then(resolve, reject) })
    void drain()
  })
}

export interface ChatMessage { role: 'system' | 'user'; content: string }

/**
 * Sends one chat completion request. Returns the raw assistant message text.
 * Throws with a user-facing Chinese message on any failure.
 */
export async function chatCompletion(messages: ChatMessage[], options: { timeoutMs?: number } = {}): Promise<string> {
  const config = getAiConfig()
  const endpoint = normalizeEndpoint(config.baseUrl)
  if (!endpoint) throw new Error('尚未配置 AI 服务地址')
  if (!config.model) throw new Error('尚未配置 AI 模型名称')
  const apiKey = readApiKey()
  return enqueue(async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: 'Bearer ' + apiKey } : {})
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature: 0.2,
          stream: false
        }),
        signal: controller.signal
      })
      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new Error('AI 服务返回 ' + response.status + (detail ? '：' + detail.slice(0, 160) : ''))
      }
      const payload = await response.json() as { choices?: { message?: { content?: unknown } }[] }
      const content = payload.choices?.[0]?.message?.content
      if (typeof content !== 'string' || !content.trim()) throw new Error('AI 服务没有返回内容')
      return content
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') throw new Error('AI 服务响应超时')
      throw error instanceof Error ? error : new Error('AI 请求失败')
    } finally {
      clearTimeout(timer)
    }
  })
}

/** Connection test from the settings panel. */
export async function testAiConnection(): Promise<{ ok: boolean; message: string; encrypted: boolean }> {
  const encrypted = aiKeyEncrypted()
  try {
    const reply = await chatCompletion([
      { role: 'system', content: 'Reply with the single word: ok' },
      { role: 'user', content: 'ping' }
    ], { timeoutMs: 15000 })
    return { ok: true, message: '连接成功：' + reply.trim().slice(0, 60), encrypted }
  } catch (error) {
    return { ok: false, message: (error as Error).message || '连接失败', encrypted }
  }
}
