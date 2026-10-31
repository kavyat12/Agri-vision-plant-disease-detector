import { ApiError } from './api'

const TOKEN_KEY = 'agrivision:access-token:v1'

export function getStoredAccessToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function storeAccessToken(token) {
  try {
    sessionStorage.setItem(TOKEN_KEY, token)
  } catch {
    throw new ApiError('This browser could not store the sign-in session.')
  }
}

export function clearAccessToken() {
  try {
    sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    throw new ApiError('This browser could not clear the sign-in session.')
  }
}
