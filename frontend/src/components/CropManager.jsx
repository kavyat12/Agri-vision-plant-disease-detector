import { useEffect, useState } from 'react'
import { createCrop, deleteCrop, listCrops, updateCrop } from '../utils/api'

const EMPTY_CROP = {
  name: '',
  variety: '',
  planting_date: '',
  farm_location: '',
  soil_type: '',
  growth_stage: '',
}

function requestBody(form) {
  return Object.fromEntries(
    Object.entries(form).map(([key, value]) => [key, value.trim() || null]),
  )
}

export default function CropManager({ token, t }) {
  const [crops, setCrops] = useState([])
  const [form, setForm] = useState(EMPTY_CROP)
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    listCrops(token)
      .then((records) => { if (active) setCrops(records) })
      .catch((requestError) => { if (active) setError(requestError.message || t('cropError')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [token, reload, t])

  function editCrop(crop) {
    setEditingId(crop.id)
    setForm({
      name: crop.name,
      variety: crop.variety || '',
      planting_date: crop.planting_date || '',
      farm_location: crop.farm_location || '',
      soil_type: crop.soil_type || '',
      growth_stage: crop.growth_stage || '',
    })
    setError('')
  }

  function resetForm() {
    setEditingId(null)
    setForm(EMPTY_CROP)
  }

  async function submit(event) {
    event.preventDefault()
    setPending(true)
    setError('')
    try {
      if (editingId) await updateCrop(token, editingId, requestBody(form))
      else await createCrop(token, requestBody(form))
      resetForm()
      setReload((value) => value + 1)
    } catch (requestError) {
      setError(requestError.message || t('cropError'))
    } finally {
      setPending(false)
    }
  }

  async function removeCrop(crop) {
    if (!window.confirm(`${t('deleteCrop')} "${crop.name}"?`)) return
    setError('')
    try {
      await deleteCrop(token, crop.id)
      if (editingId === crop.id) resetForm()
      setReload((value) => value + 1)
    } catch (requestError) {
      setError(requestError.message || t('cropError'))
    }
  }

  function changeField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  const fields = [
    ['name', 'cropName', true],
    ['variety', 'variety'],
    ['planting_date', 'plantingDate'],
    ['farm_location', 'farmLocation'],
    ['soil_type', 'soilType'],
    ['growth_stage', 'growthStage'],
  ]

  return (
    <section className="card p-5 sm:p-7" aria-labelledby="crops-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">{t('cropRecords')}</p>
          <h2 id="crops-title" className="mt-1 font-display text-2xl font-bold">{t('cropRecords')}</h2>
        </div>
      </div>

      <form className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={submit}>
        {fields.map(([name, label, required]) => (
          <label key={name} className="grid gap-1 text-sm font-semibold">
            {t(label)}
            <input
              className="input"
              name={name}
              type={name === 'planting_date' ? 'date' : 'text'}
              value={form[name]}
              onChange={changeField}
              maxLength={name === 'name' ? 120 : 200}
              required={Boolean(required)}
            />
          </label>
        ))}
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-3">
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? t('saving') : (editingId ? t('save') : t('addCrop'))}
          </button>
          {editingId && (
            <button type="button" className="btn-outline" onClick={resetForm} disabled={pending}>
              {t('cancel')}
            </button>
          )}
        </div>
      </form>

      {error && <p className="mt-4 text-sm text-red-700" role="alert">{error}</p>}
      <div className="mt-6 border-t pt-4" style={{ borderColor: 'var(--line)' }}>
        {loading ? (
          <p role="status">{t('loadingRecords')}</p>
        ) : crops.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>{t('noCropRecords')}</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {crops.map((crop) => (
              <li key={crop.id} className="rounded-xl border p-4" style={{ borderColor: 'var(--line)' }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold">{crop.name}{crop.variety ? ` · ${crop.variety}` : ''}</h3>
                    <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
                      {[crop.planting_date, crop.growth_stage, crop.soil_type, crop.farm_location].filter(Boolean).join(' · ') || t('noCropDetails')}
                    </p>
                  </div>
                  <div className="flex gap-2 text-sm">
                    <button type="button" className="underline" onClick={() => editCrop(crop)}>{t('edit')}</button>
                    <button type="button" className="underline text-red-700" onClick={() => void removeCrop(crop)}>{t('delete')}</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
