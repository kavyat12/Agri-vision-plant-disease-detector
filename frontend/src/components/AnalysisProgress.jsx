export default function AnalysisProgress({ preview, provider }) {
  return (
    <div className="space-y-6 animate-fade-in" role="status" aria-live="polite" aria-label="Analysis in progress">
      <div className="flex flex-col sm:flex-row gap-5 items-start">
        {preview && (
          <img src={preview} alt="" aria-hidden="true" className="w-full sm:w-44 h-32 object-cover rounded-2xl border" style={{ borderColor: 'var(--line)' }} />
        )}
        <div className="flex flex-1 items-center gap-4">
          <svg className="h-8 w-8 shrink-0 animate-spin text-green-700" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
          </svg>
          <div>
            <p className="eyebrow">Requesting assessment from {provider === 'anthropic' ? 'Claude' : 'OpenAI'}</p>
            <h3 className="mt-2 font-display text-2xl font-bold">Waiting for the AI provider…</h3>
            <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
              Progress details are not available from this provider. No result is shown until it responds.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
