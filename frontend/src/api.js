const rawApiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const API_BASE = rawApiBase && !rawApiBase.startsWith('http') ? `https://${rawApiBase}` : rawApiBase

export async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  })
  const text = await res.text()
  let payload = null
  try { payload = text ? JSON.parse(text) : null } catch { payload = text }
  if (!res.ok) {
    const message = payload?.error || payload?.details || res.statusText || 'Request failed'
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message))
  }
  return payload
}

export function toNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export function formatNumber(value, digits = 2) {
  return toNumber(value).toLocaleString('th-TH', { maximumFractionDigits: digits })
}

export function currentMonth() {
  return new Date().toISOString().slice(0, 7)
}
