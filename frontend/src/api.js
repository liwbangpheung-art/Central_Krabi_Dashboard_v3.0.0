const rawApiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const API_BASE = rawApiBase && !rawApiBase.startsWith('http') ? `https://${rawApiBase}` : rawApiBase

function buildHeaders(options = {}) {
  const token = localStorage.getItem('ckap_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {})
  }
}

export async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: buildHeaders(options),
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

export async function apiDownload(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: buildHeaders(options),
    ...options
  })
  if (!res.ok) {
    const text = await res.text()
    let payload = null
    try { payload = text ? JSON.parse(text) : null } catch { payload = text }
    const message = payload?.error || payload?.details || res.statusText || 'Download failed'
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message))
  }
  const disposition = res.headers.get('content-disposition') || ''
  const match = disposition.match(/filename="?([^";]+)"?/i)
  return { blob: await res.blob(), filename: match?.[1] || 'CKAP-report.pptx' }
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
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

export const MODULE_LABELS = {
  rdf: 'RDF',
  dog_food: 'อาหารหมา',
  pig_feed: 'อาหารหมู',
  wet_waste: 'ขยะเปียก',
  recycle: 'รีไซเคิล',
  tissue: 'กระดาษทิชชู่',
  black_bag: 'ถุงดำ',
  consumable: 'ของใช้สิ้นเปลือง'
}

export const MODULE_ORDER = ['rdf', 'dog_food', 'pig_feed', 'wet_waste', 'recycle', 'tissue', 'black_bag', 'consumable']
