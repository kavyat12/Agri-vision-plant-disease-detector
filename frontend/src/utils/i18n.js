import en from '../locales/en'
import hi from '../locales/hi'
import kn from '../locales/kn'
import mr from '../locales/mr'

const RESOURCES = { en, hi, kn, mr }
const KEY = 'pdd:locale:v1'

export function getLocale() {
  try {
    const stored = localStorage.getItem(KEY)
    return stored && RESOURCES[stored] ? stored : 'en'
  } catch {
    return 'en'
  }
}

export function setLocale(locale) {
  if (!RESOURCES[locale]) return
  try {
    localStorage.setItem(KEY, locale)
  } catch {
    /* Browser storage may be disabled; the current selection still applies. */
  }
}

export function t(locale, key) {
  return RESOURCES[locale]?.[key] || RESOURCES.en[key] || key
}

export const LOCALES = [
  { id: 'en', label: 'EN' },
  { id: 'kn', label: 'ಕನ್ನಡ' },
  { id: 'hi', label: 'हिंदी' },
  { id: 'mr', label: 'मराठी' },
]
