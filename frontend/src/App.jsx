import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import SkipLink from './components/SkipLink'
import Header from './components/Header'
import Footer from './components/Footer'
import UploadZone from './components/UploadZone'
import ResultDisplay from './components/ResultDisplay'
import AnalysisProgress from './components/AnalysisProgress'
import HistoryPanel from './components/HistoryPanel'
import ChatAssistant from './components/ChatAssistant'
import AuthPanel from './components/AuthPanel'
import CropManager from './components/CropManager'
import { Hero, HowItWorks, TrustBar } from './components/Landing'
import { FeaturesGrid, FarmerTips, PreventionCalendar } from './components/InfoSections'
import { Toasts } from './components/Feedback'
import { useTheme } from './hooks/useTheme'
import { detectDisease, getCurrentUser, getDiseases, getProviders } from './utils/api'
import { clearAccessToken, getStoredAccessToken } from './utils/authSession'
import { loadHistory, saveResult } from './utils/history'
import { getLocale, setLocale, t } from './utils/i18n'

let toastId = 0

export default function App() {
  const { dark, toggle } = useTheme()
  const [locale, setLoc] = useState(getLocale())
  const [activeTab, setActiveTab] = useState('analyze')
  const [accessToken, setAccessToken] = useState(() => getStoredAccessToken())
  const [user, setUser] = useState(null)
  const [accountError, setAccountError] = useState('')

  const [image, setImage] = useState(null)
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)
  const [phase, setPhase] = useState('idle') // idle | analyzing | done
  const [error, setError] = useState(null)
  const [provider, setProvider] = useState('openai')
  const [includeTreatment, setIncludeTreatment] = useState(true)
  const [includePrevention, setIncludePrevention] = useState(true)
  const [backendOnline, setBackendOnline] = useState(false)
  const [providers, setProviders] = useState([])
  const [history, setHistory] = useState(() => loadHistory())
  const [toasts, setToasts] = useState([])
  const [library, setLibrary] = useState([])
  const objectUrl = useRef(null)

  const tr = useCallback((key) => t(locale, key), [locale])

  const notify = useCallback((message) => {
    const id = ++toastId
    setToasts((prev) => [...prev, { id, message }])
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 3200)
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  useEffect(() => {
    let active = true
    if (!accessToken) {
      setUser(null)
      setAccountError('')
      return () => { active = false }
    }

    setUser(null)
    getCurrentUser(accessToken)
      .then((profile) => {
        if (active) {
          setUser(profile)
          setAccountError('')
        }
      })
      .catch((requestError) => {
        if (!active) return
        if (requestError.status === 401) {
          try {
            clearAccessToken()
          } catch (storageError) {
            setAccountError(storageError.message)
          }
          setAccessToken(null)
          setUser(null)
        } else {
          setAccountError(requestError.message || t('accountError'))
        }
      })
    return () => { active = false }
  }, [accessToken, tr])

  useEffect(() => {
    let alive = true
    getProviders()
      .then((p) => {
        if (alive) {
          setProviders(p.providers || [])
          setBackendOnline(true)
        }
      })
      .catch(() => {
        if (alive) {
          setProviders([])
          setBackendOnline(false)
        }
      })
    getDiseases()
      .then((d) => { if (alive) setLibrary(d.diseases || []) })
      .catch(() => { if (alive) setLibrary([]) })
    return () => { alive = false }
  }, [])

  useEffect(() => () => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
  }, [])

  const handleImageSelect = useCallback((file) => {
    setImage(file)
    setResult(null)
    setError(null)
    setPhase('idle')
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    const url = URL.createObjectURL(file)
    objectUrl.current = url
    setPreview(url)
  }, [])

  const handleRemoveImage = useCallback(() => {
    setImage(null)
    setResult(null)
    setError(null)
    setPhase('idle')
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    objectUrl.current = null
    setPreview(null)
  }, [])

  const runAnalysis = useCallback(async (file, opts) => {
    setPhase('analyzing')
    setError(null)
    try {
      const data = await detectDisease(file, opts, { retries: 1 })
      if (!data.success) throw new Error(data.error || 'Analysis failed. Please try again.')
      setResult(data)
      setPhase('done')
      setHistory(saveResult({ result: data, preview: objectUrl.current || preview }))
      return data
    } catch (err) {
      setError(err.message || 'Analysis failed')
      setPhase('idle')
      return null
    }
  }, [preview])

  const handleAnalyze = useCallback(() => {
    if (!image || phase === 'analyzing') return
    runAnalysis(image, { provider, include_treatment: includeTreatment, include_prevention: includePrevention })
  }, [image, phase, runAnalysis, provider, includeTreatment, includePrevention])

  const handleAuthenticated = useCallback((session) => {
    setUser(session.user)
    setAccountError('')
    setAccessToken(session.access_token)
  }, [])

  const handleLoggedOut = useCallback(() => {
    setUser(null)
    setAccessToken(null)
    setAccountError('')
  }, [])

  // Keyboard shortcuts: Enter = analyze, Esc = clear.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && image && phase !== 'analyzing') handleRemoveImage()
      if (e.key === 'Enter' && image && phase === 'idle' && document.activeElement?.tagName !== 'BUTTON') handleAnalyze()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [image, phase, handleAnalyze, handleRemoveImage])

  const tabTitle = useMemo(() => ({
    analyze: 'Analyze leaf', farm: tr('myFarm'), chat: 'AI Assistant', library: 'Disease library',
    how: 'How it works', history: 'History', faq: 'FAQ',
  }), [tr])

  return (
    <div className="min-h-screen flex flex-col">
      <SkipLink />
      <Header
        activeTab={activeTab}
        onTab={setActiveTab}
        dark={dark}
        onToggleDark={toggle}
        locale={locale}
        onLocale={(l) => { setLoc(l); setLocale(l) }}
        backendOnline={backendOnline}
        t={tr}
      />

      <main id="analyzer" className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {activeTab === 'analyze' && (
          <div className="animate-fade-in">
            <Hero onAnalyze={() => window.scrollTo({ top: 400, behavior: 'smooth' })} t={tr} />
            <TrustBar />
            <FeaturesGrid />
            <div className="card p-5 sm:p-8" aria-label="Analyzer">
              {phase === 'analyzing' ? (
                <AnalysisProgress preview={preview} provider={provider} />
              ) : result && phase === 'done' ? (
                <ResultDisplay result={result} preview={preview} onRetry={handleAnalyze} onNewAnalysis={handleRemoveImage} notify={notify} />
              ) : (
                <div className="space-y-5">
                  <UploadZone
                    image={image} preview={preview} loading={false} error={error}
                    onImageSelect={handleImageSelect} onRemoveImage={handleRemoveImage} onAnalyze={handleAnalyze}
                    provider={provider} setProvider={setProvider}
                    includeTreatment={includeTreatment} setIncludeTreatment={setIncludeTreatment}
                    includePrevention={includePrevention} setIncludePrevention={setIncludePrevention}
                    t={tr}
                  />
                </div>
              )}
            </div>
            <FarmerTips />
            <PreventionCalendar />
          </div>
        )}

        {activeTab === 'library' && (
          <section className="card p-6 sm:p-8 animate-fade-in" aria-labelledby="lib-title">
            <span className="eyebrow">Library · {library.length || 8} entries</span>
            <h2 id="lib-title" className="font-display text-3xl font-bold mt-2">Know your enemy</h2>
            <p className="mt-1" style={{ color: 'var(--muted)' }}>Browse the plant-health reference library.</p>
            <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {(library.length ? library : FALLBACK_LIBRARY).map((d) => (
                <article key={d.id || d.name} className="rounded-2xl border p-5 card-hover" style={{ borderColor: 'var(--line)' }}>
                  <h3 className="font-bold">{d.name}</h3>
                  {d.scientific_name && <p className="text-sm italic" style={{ color: 'var(--muted)' }}>{d.scientific_name}</p>}
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {(d.symptoms || []).slice(0, 3).map((s, i) => <li key={i} className="flex gap-2"><span aria-hidden="true">•</span><span>{s}</span></li>)}
                  </ul>
                  <p className="mt-3 text-sm"><strong>Prevention:</strong> {d.prevention || d.treatment_hint}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'chat' && (
          <ChatAssistant locale={locale} providers={providers} backendOnline={backendOnline} t={tr} />
        )}

        {activeTab === 'farm' && (
          <section className="animate-fade-in space-y-5" aria-labelledby="farm-title">
            <div>
              <span className="eyebrow">{tr('myFarm')}</span>
              <h1 id="farm-title" className="mt-2 font-display text-3xl font-bold">{tr('farmIntro')}</h1>
            </div>
            <AuthPanel
              accessToken={accessToken}
              user={user}
              accountError={accountError}
              onAuthenticated={handleAuthenticated}
              onLoggedOut={handleLoggedOut}
              t={tr}
            />
            {accessToken && user && <CropManager token={accessToken} t={tr} />}
          </section>
        )}

        {activeTab === 'how' && (
          <div className="animate-fade-in"><HowItWorks />
            <section className="card p-6 sm:p-8" aria-label="Field photography guide">
              <h3 className="font-display text-xl font-bold">Photo guide for best accuracy</h3>
              <ol className="mt-3 grid sm:grid-cols-2 gap-3 text-sm">
                {['Shoot in daylight, no flash', 'Fill frame with one leaf', 'Focus on spots, not soil', 'Avoid fingers and shadows', 'Wipe lens before shooting', 'Take 2–3 angles if unsure'].map((x, i) => (
                  <li key={x} className="rounded-xl border p-3 flex gap-3" style={{ borderColor: 'var(--line)' }}>
                    <span className="font-bold text-green-700 dark:text-green-300">{i + 1}.</span><span>{x}</span>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}

        {activeTab === 'history' && (
          <section className="animate-fade-in" aria-labelledby="hist-title">
            <h2 id="hist-title" className="sr-only">History</h2>
            <HistoryPanel items={history} onRestore={(h) => { setResult(h.result); setPreview(h.preview || null); setPhase('done'); setActiveTab('analyze') }} onClear={setHistory} onExport={() => notify('History exported')} />
          </section>
        )}

        {activeTab === 'faq' && (
          <section className="card p-6 sm:p-8 animate-fade-in" aria-labelledby="faq-title">
            <span className="eyebrow">FAQ</span>
            <h2 id="faq-title" className="font-display text-3xl font-bold mt-2">Questions, answered</h2>
            <div className="mt-5 grid gap-3">
              {FAQ.map(([q, a]) => (
                <details key={q} className="rounded-2xl border p-4 group" style={{ borderColor: 'var(--line)' }}>
                  <summary className="font-bold cursor-pointer list-none flex justify-between gap-3">{q}<span aria-hidden="true" className="text-green-700 group-open:rotate-45 transition-transform">+</span></summary>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>{a}</p>
                </details>
              ))}
            </div>
          </section>
        )}

        <p className="sr-only" aria-live="polite">Current section: {tabTitle[activeTab]}</p>
      </main>

      <Footer onTab={setActiveTab} backendOnline={backendOnline} t={tr} />
      <Toasts items={toasts} />
    </div>
  )
}

const FALLBACK_LIBRARY = [
  { id: 'early-blight', name: 'Early Blight', scientific_name: 'Alternaria solani', symptoms: ['Concentric brown rings', 'Yellow halo', 'Lower-leaf drop'], prevention: 'Rotate crops, mulch, water at base.' },
  { id: 'late-blight', name: 'Late Blight', scientific_name: 'Phytophthora infestans', symptoms: ['Water-soaked lesions', 'White mold underside', 'Rapid collapse'], prevention: 'Certified seed, spacing, dry foliage at night.' },
  { id: 'powdery-mildew', name: 'Powdery Mildew', scientific_name: 'Podosphaera xanthii', symptoms: ['White powder patches', 'Leaf curl', 'Stunted shoots'], prevention: 'Resistant varieties, sun + airflow.' },
  { id: 'leaf-spot', name: 'Leaf Spot', scientific_name: 'Cercospora spp.', symptoms: ['Circular brown spots', 'Gray centers'], prevention: 'Clean debris, drip irrigation.' },
  { id: 'rust', name: 'Rust', scientific_name: 'Puccinia spp.', symptoms: ['Orange pustules', 'Yellow flecks'], prevention: 'Resistant seed, morning watering.' },
  { id: 'mosaic-virus', name: 'Mosaic Virus', scientific_name: 'Virus complex', symptoms: ['Mottled mosaic', 'Distortion'], prevention: 'Control vectors, clean tools.' },
]

const FAQ = [
  ['Do I need an API key?', 'Yes. Configure an OpenAI or Anthropic key in backend/.env. Without a configured provider, diagnosis and chat are unavailable.'],
  ['Which photos work best?', 'One in-focus leaf filling the frame, shot in daylight. Avoid shadows, fingers, and busy backgrounds.'],
  ['Is this medical-grade advice?', 'No — it is educational decision support. Always confirm treatment with your local agricultural extension officer.'],
  ['Where is my data stored?', 'History stays in your browser localStorage. Images are sent to your configured backend only for analysis.'],
  ['Can I use it offline?', 'No. Disease assessment and chat require the backend and a configured AI provider.'],
]
