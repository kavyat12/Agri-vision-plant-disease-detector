import { useState } from 'react'
import { loginAccount, logoutAccount, registerAccount } from '../utils/api'
import { clearAccessToken, storeAccessToken } from '../utils/authSession'

export default function AuthPanel({
  accessToken,
  user,
  accountError,
  onAuthenticated,
  onLoggedOut,
  t,
}) {
  const [mode, setMode] = useState('login')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setPending(true)
    setError('')
    try {
      const session = mode === 'register'
        ? await registerAccount({ full_name: fullName, email, password })
        : await loginAccount({ email, password })
      storeAccessToken(session.access_token)
      setPassword('')
      onAuthenticated(session)
    } catch (requestError) {
      setError(requestError.message || t('accountError'))
    } finally {
      setPending(false)
    }
  }

  async function signOut() {
    setPending(true)
    setError('')
    try {
      await logoutAccount(accessToken)
      clearAccessToken()
      onLoggedOut()
    } catch (requestError) {
      setError(requestError.message || t('accountError'))
    } finally {
      setPending(false)
    }
  }

  if (accessToken && user) {
    return (
      <section className="card p-5 sm:p-6" aria-labelledby="account-title">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="eyebrow">{t('account')}</p>
            <h2 id="account-title" className="mt-1 font-display text-2xl font-bold">{user.full_name}</h2>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>{user.email}</p>
          </div>
          <button type="button" className="btn-outline" onClick={signOut} disabled={pending}>
            {pending ? t('signingOut') : t('signOut')}
          </button>
        </div>
        {error && <p className="mt-4 text-sm text-red-700" role="alert">{error}</p>}
      </section>
    )
  }

  if (accessToken && !user) {
    return (
      <section className="card p-5" role={accountError ? 'alert' : 'status'}>
        {accountError || t('sessionLoading')}
      </section>
    )
  }

  return (
    <section className="card p-5 sm:p-7" aria-labelledby="account-title">
      <p className="eyebrow">{t('account')}</p>
      <h2 id="account-title" className="mt-1 font-display text-2xl font-bold">
        {mode === 'register' ? t('register') : t('login')}
      </h2>
      <div className="mt-4 flex gap-2" role="group" aria-label={t('account')}>
        <button type="button" className={mode === 'login' ? 'btn-primary' : 'btn-outline'} onClick={() => { setMode('login'); setError('') }}>
          {t('login')}
        </button>
        <button type="button" className={mode === 'register' ? 'btn-primary' : 'btn-outline'} onClick={() => { setMode('register'); setError('') }}>
          {t('register')}
        </button>
      </div>
      <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        {mode === 'register' && (
          <label className="grid gap-1 text-sm font-semibold sm:col-span-2">
            {t('fullName')}
            <input className="input" value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" maxLength={120} required />
          </label>
        )}
        <label className="grid gap-1 text-sm font-semibold sm:col-span-2">
          {t('email')}
          <input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" maxLength={254} required />
        </label>
        <label className="grid gap-1 text-sm font-semibold sm:col-span-2">
          {t('password')}
          <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={mode === 'register' ? 12 : 1} maxLength={128} required />
          {mode === 'register' && <span className="text-xs font-normal" style={{ color: 'var(--muted)' }}>{t('passwordHelp')}</span>}
        </label>
        {(error || accountError) && (
          <p className="text-sm text-red-700 sm:col-span-2" role="alert">{error || accountError}</p>
        )}
        <button type="submit" className="btn-primary sm:col-span-2" disabled={pending}>
          {pending
            ? (mode === 'register' ? t('creatingAccount') : t('signingIn'))
            : (mode === 'register' ? t('register') : t('signIn'))}
        </button>
      </form>
    </section>
  )
}
