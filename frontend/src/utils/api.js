const API_BASE = import.meta.env.VITE_API_BASE || '/api/v1'
const DEFAULT_TIMEOUT_MS = 60000

class ApiError extends Error {
  constructor(message, { status, payload } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

function parseBool(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'boolean') return value
  return String(value).toLowerCase() !== 'false'
}

export async function detectDisease(imageFile, options = {}, { timeoutMs = DEFAULT_TIMEOUT_MS, retries = 1 } = {}) {
  const formData = new FormData()
  formData.append('file', imageFile)
  formData.append('provider', options.provider || 'openai')
  formData.append('include_treatment', parseBool(options.include_treatment, true))
  formData.append('include_prevention', parseBool(options.include_prevention, true))

  let lastError
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(`${API_BASE}/detect`, { method: 'POST', body: formData }, timeoutMs)
      if (!response.ok) {
        let detail = `Request failed (${response.status})`
        try {
          const err = await response.json()
          detail = err.detail || err.error || detail
        } catch {
          /* keep default */
        }
        throw new ApiError(detail, { status: response.status })
      }
      return await response.json()
    } catch (err) {
      lastError = err?.name === 'AbortError' ? new ApiError('Request timed out. Try a smaller image or retry later.') : err
      if (attempt < retries) await new Promise((r) => setTimeout(r, 600 * (attempt + 1)))
    }
  }
  throw lastError
}

export async function checkHealth(timeoutMs = 8000) {
  const response = await fetchWithTimeout(`${API_BASE}/health`, {}, timeoutMs)
  if (!response.ok) throw new ApiError('Health check failed', { status: response.status })
  return response.json()
}

export async function getProviders(timeoutMs = 8000) {
  const response = await fetchWithTimeout(`${API_BASE}/providers`, {}, timeoutMs)
  if (!response.ok) throw new ApiError('Failed to load provider status', { status: response.status })
  return response.json()
}

export async function sendChatMessage(payload, timeoutMs = DEFAULT_TIMEOUT_MS) {
  let response
  try {
    response = await fetchWithTimeout(
      `${API_BASE}/chat`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      timeoutMs,
    )
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new ApiError('The chat request timed out. Please try again.')
    }
    throw error
  }

  if (!response.ok) {
    let detail = `Chat request failed (${response.status})`
    try {
      const payload = await response.json()
      detail = payload.detail || payload.error || detail
    } catch {
      /* Keep the status-based message for non-JSON responses. */
    }
    throw new ApiError(detail, { status: response.status })
  }
  return response.json()
}

export async function getDiseases(timeoutMs = 8000) {
  const response = await fetchWithTimeout(`${API_BASE}/diseases`, {}, timeoutMs)
  if (!response.ok) throw new ApiError('Failed to load disease library')
  return response.json()
}

export async function sendFeedback(payload, timeoutMs = 8000) {
  const response = await fetchWithTimeout(
    `${API_BASE}/feedback`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
    timeoutMs,
  )
  if (!response.ok) throw new ApiError('Feedback failed')
  return response.json()
}

async function authenticatedRequest(path, token, { method = 'GET', body } = {}) {
  const headers = { Authorization: `Bearer ${token}` }
  const options = { method, headers }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    options.body = JSON.stringify(body)
  }

  let response
  try {
    response = await fetchWithTimeout(`${API_BASE}${path}`, options, 15000)
  } catch (error) {
    if (error?.name === 'AbortError') throw new ApiError('The request timed out. Please try again.')
    throw error
  }

  if (!response.ok) {
    let detail = `Request failed (${response.status})`
    try {
      detail = (await response.json()).detail || detail
    } catch {
      /* Keep the status-based message for non-JSON responses. */
    }
    throw new ApiError(detail, { status: response.status })
  }
  return response.status === 204 ? null : response.json()
}

async function sendAccountRequest(path, payload, action) {
  let response
  try {
    response = await fetchWithTimeout(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, 15000)
  } catch (error) {
    if (error?.name === 'AbortError') throw new ApiError(`${action} timed out. Please try again.`)
    throw error
  }
  if (!response.ok) {
    let detail = `${action} failed (${response.status})`
    try {
      const payloadError = (await response.json()).detail
      if (typeof payloadError === 'string') detail = payloadError
      else if (Array.isArray(payloadError)) detail = 'Check the account details and try again.'
    } catch {
      /* Keep the status-based message for non-JSON responses. */
    }
    throw new ApiError(detail, { status: response.status })
  }
  return response.json()
}

export function registerAccount(payload) {
  return sendAccountRequest('/auth/register', payload, 'Registration')
}

export function loginAccount(payload) {
  return sendAccountRequest('/auth/login', payload, 'Login')
}

export function getCurrentUser(token) {
  return authenticatedRequest('/auth/me', token)
}

export function logoutAccount(token) {
  return authenticatedRequest('/auth/logout', token, { method: 'POST' })
}

export function listCrops(token) {
  return authenticatedRequest('/crops', token)
}

export function createCrop(token, payload) {
  return authenticatedRequest('/crops', token, { method: 'POST', body: payload })
}

export function updateCrop(token, cropId, payload) {
  return authenticatedRequest(`/crops/${encodeURIComponent(cropId)}`, token, {
    method: 'PUT',
    body: payload,
  })
}

export function deleteCrop(token, cropId) {
  return authenticatedRequest(`/crops/${encodeURIComponent(cropId)}`, token, { method: 'DELETE' })
}

export { ApiError }
